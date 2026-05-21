from __future__ import annotations

import io

import pandas as pd
import plotly.express as px
import streamlit as st

from data_utils import (
    build_issuer_master,
    merge_market_data,
    read_uploaded_file,
    standardize_bonds,
    standardize_issuer_mapping,
    standardize_mmd,
    standardize_trades,
)


st.set_page_config(page_title="Municipal Secondary Market Dashboard Generator", layout="wide")
st.title("Municipal Secondary Market Dashboard Generator")
st.caption("Bring your own bond master and trade-history exports. Generate issuer-level relative value and liquidity analytics.")

with st.expander("Instructions", expanded=False):
    st.markdown(
        """
<div style='font-size:15px; color:black; line-height:1.4;'>

<h5 style='margin-bottom:4px;'>Step 1: Upload Required Files</h5>

<div style='padding-left:18px;'>

<b>1. Bond File</b>

<ul style='margin-top:2px; margin-bottom:6px;'>
<li>Information can be found from Munipro</li>
<li>Row 1 must contain column headers</li>
<li>Actual data should begin from Row 2</li>
<li>Multiple issuers’ bond data should be combined into the same file</li>
</ul>

<b>Minimum Required Columns:</b><br>Issuer, Cusip, Maturity<br><br><b>Recommended Columns:</b><br>Type, Lien, Election, Series, Secondary Credit, Term, Par Amount, Outstanding Amount, Coupon, Call Date, Call Price, Fed Tax, AMT

<div style='height:10px;'></div>

<b>2. Trade History File(s)</b>

<ul style='margin-top:2px; margin-bottom:6px;'>
<li>Information can be extracted from Munipro</li>
<li>Row 1 must contain column headers</li>
<li>Actual data should begin from Row 2</li>
<li>Trade files should be uploaded separately</li>
</ul>

<b>Minimum Required Columns:</b><br>CUSIP9, Trade Date, Yield<br><br><b>Recommended Columns:</b><br>Trade Date/Time, Description, Maturity Date, Settlement Date, Coupon, Price, Trade Amount, Calculation Date, Calculation Price, Index, Index Rate, Spread, Trade Type, Ratings M/S/F

<div style='height:8px;'></div>

<b>Important:</b><br>
CUSIP9 in Trade Files must match Cusip in Bond File.

<div style='height:10px;'></div>

<b>3. Optional Files</b>

<ul style='margin-top:2px; margin-bottom:2px;'>
<li>Issuer / Sector Mapping File</li>
<li>MMD Curve File</li>
</ul>

</div>

<h5 style='margin-top:10px; margin-bottom:4px;'>Step 2: Automatic Issuer Detection</h5>

<div style='padding-left:18px;'>
The dashboard automatically detects issuer names from uploaded datasets.
</div>

<h5 style='margin-top:10px; margin-bottom:4px;'>Step 3: Select Uploaded Issuer</h5>

<div style='padding-left:18px;'>

<ul style='margin-top:2px; margin-bottom:6px;'>
<li>Select one of the detected issuers</li>
<li>Apply optional filters:
    <ul style='margin-top:2px; margin-bottom:2px;'>
        <li>Maturity Bucket</li>
        <li>Time Window</li>
        <li>Relative Value Comparison</li>
    </ul>
</li>
</ul>

</div>

</div>
""",
        unsafe_allow_html=True

    )

# -----------------------------------------------------------------------------
# Team-readiness validation layer
# -----------------------------------------------------------------------------
# Goal: keep the dashboard usable even when files come from different people or
# slightly different Munipro exports. We separate fields into:
#   1) REQUIRED: the app needs these to run.
#   2) RECOMMENDED: the app can run without them, but analytics become weaker.
#   3) OPTIONAL: nice-to-have reference fields.

COLUMN_ALIASES: dict[str, list[str]] = {
    # Shared identifiers
    "cusip": ["cusip", "cusip9", "cusip 9", "cusip_9", "security id", "security_id"],
    "issuer": ["issuer", "issuer name", "issuer_name", "obligor", "borrower"],
    "sector": ["sector", "industry", "sector name", "sector_name"],
    "primary_type": ["type", "primary type", "primary_type", "bond type"],
    # Bond master fields
    "lien": ["lien"],
    "election": ["election"],
    "series": ["series"],
    "secondary_credit": ["secondary credit", "secondary_credit", "credit", "credit enhancement"],
    "term": ["term"],
    "maturity": ["maturity", "maturity date", "maturity_date"],
    "par_amount": ["par amount", "par_amount", "par", "amount issued"],
    "outstanding_amount": ["outstanding amount", "outstanding_amount", "amount outstanding", "current amount outstanding"],
    "coupon": ["coupon", "coupon rate", "coupon_rate"],
    "call_date": ["call date", "call_date", "first call date", "first_call_date"],
    "call_price": ["call price", "call_price"],
    "fed_tax": ["fed tax", "fed_tax", "tax status", "tax_status"],
    "amt": ["amt", "alternative minimum tax"],
    "rating": ["rating", "ratings", "ratings m/s/f", "ratings_m_s_f", "moody/s&p/fitch"],
    # Trade fields
    "trade_datetime": ["trade date/time", "trade datetime", "trade_datetime", "datetime"],
    "trade_date": ["trade date", "trade_date", "date", "transaction date"],
    "settlement_date": ["settlement date", "settlement_date", "settle date"],
    "description": ["description", "security description", "bond description"],
    "maturity_trade": ["maturity date", "maturity_date", "maturity"],
    "yield": ["yield", "yield to worst", "ytw", "yield_to_worst", "yield to maturity", "ytm"],
    "price": ["price", "trade price", "execution price"],
    "trade_amount": ["trade amount", "trade_amount", "par traded", "par amount", "amount", "quantity"],
    "calculation_date": ["calculation date", "calculation_date"],
    "calculation_price": ["calculation price", "calculation_price"],
    "index": ["index", "benchmark"],
    "index_rate": ["index rate", "index_rate", "benchmark rate"],
    "spread": ["spread", "g spread", "z spread", "spread to benchmark"],
    "trade_type": ["trade type", "trade_type", "side", "buy/sell"],
}

BOND_REQUIRED = ["cusip", "issuer", "maturity"]
BOND_RECOMMENDED = [
    "coupon", "outstanding_amount", "call_date", "call_price", "sector", "secondary_credit", "fed_tax", "amt"
]
BOND_OPTIONAL = ["primary_type", "lien", "election", "series", "term", "par_amount", "rating"]

TRADE_REQUIRED = ["cusip", "trade_date", "yield"]
TRADE_RECOMMENDED = ["price", "trade_amount", "trade_type", "spread", "settlement_date", "rating"]
TRADE_OPTIONAL = ["trade_datetime", "description", "maturity_trade", "calculation_date", "calculation_price", "index", "index_rate"]

MMD_REQUIRED = ["date"]
MMD_RECOMMENDED = ["1Y", "2Y", "5Y", "10Y", "20Y", "30Y"]


# -----------------------------------------------------------------------------
# Benchmark curve assumptions
# -----------------------------------------------------------------------------
# MMD is treated as the AAA municipal benchmark curve. Non-AAA curves are
# approximated by adding transparent, maturity-adjusted credit spread assumptions
# to the selected MMD tenor. Units are percentage points, not basis points:
#   0.10 = 10 bps.
# These assumptions are intentionally visible in the app so the team can review,
# override, or replace them with paid/internal curve data later.

RATING_SPREADS: dict[str, dict[str, float]] = {
    "AAA": {"5Y": 0.00, "10Y": 0.00, "20Y": 0.00, "30Y": 0.00},
    "AA+": {"5Y": 0.08, "10Y": 0.10, "20Y": 0.12, "30Y": 0.15},
    "AA": {"5Y": 0.10, "10Y": 0.14, "20Y": 0.17, "30Y": 0.20},
    "AA-": {"5Y": 0.14, "10Y": 0.18, "20Y": 0.22, "30Y": 0.28},
    "A+": {"5Y": 0.22, "10Y": 0.28, "20Y": 0.35, "30Y": 0.42},
    "A": {"5Y": 0.30, "10Y": 0.38, "20Y": 0.48, "30Y": 0.58},
    "A-": {"5Y": 0.42, "10Y": 0.55, "20Y": 0.68, "30Y": 0.82},
    "BBB": {"5Y": 0.60, "10Y": 0.80, "20Y": 1.00, "30Y": 1.20},
}

MMD_BUCKET_MAP = {"Short": "5Y", "10Y": "10Y", "20Y": "20Y", "30Y": "30Y", "All": "10Y"}
BENCHMARK_RATINGS = list(RATING_SPREADS.keys())


def benchmark_curve_from_mmd(mmd_plot: pd.DataFrame, mmd_col: str, rating: str) -> pd.Series:
    """Return synthetic benchmark yield = MMD AAA yield + rating spread.

    MMD columns are assumed to be in yield percentage terms. Rating spreads are
    also stored in percentage-point terms, so 0.10 means 10 basis points.
    """
    base_curve = pd.to_numeric(mmd_plot[mmd_col], errors="coerce")
    spread_adjustment = RATING_SPREADS.get(rating, RATING_SPREADS["AAA"]).get(mmd_col, 0.00)
    return base_curve + spread_adjustment


def rating_spread_table() -> pd.DataFrame:
    """User-facing spread assumption table in both percentage points and bps."""
    rows = []
    for rating, tenors in RATING_SPREADS.items():
        row = {"Rating": rating}
        for tenor, spread_pct in tenors.items():
            row[f"{tenor} Spread"] = spread_pct
            row[f"{tenor} Spread (bps)"] = round(spread_pct * 100, 1)
        rows.append(row)
    return pd.DataFrame(rows)


def _detect_mmd_date_column(mmd_df: pd.DataFrame) -> str | None:
    """Find the MMD date column across common naming variants."""
    if "Date" in mmd_df.columns:
        return "Date"
    if "date" in mmd_df.columns:
        return "date"
    return None


def make_benchmark_long(mmd_df: pd.DataFrame, rating: str) -> pd.DataFrame:
    """Convert MMD wide curve data into long benchmark data by maturity bucket.

    Output columns:
    - trade_date: normalized MMD date
    - maturity_bucket: Short / 10Y / 20Y / 30Y
    - benchmark_rating
    - mmd_tenor
    - benchmark_yield
    - rating_spread_bps
    """
    if mmd_df.empty:
        return pd.DataFrame()

    date_col = _detect_mmd_date_column(mmd_df)
    if date_col is None:
        return pd.DataFrame()

    frames = []
    mmd_base = mmd_df.copy()
    mmd_base[date_col] = pd.to_datetime(mmd_base[date_col], errors="coerce")
    mmd_base = mmd_base.dropna(subset=[date_col])

    for bucket, tenor in MMD_BUCKET_MAP.items():
        if bucket == "All" or tenor not in mmd_base.columns:
            continue
        benchmark_yield = benchmark_curve_from_mmd(mmd_base, tenor, rating)
        frames.append(
            pd.DataFrame(
                {
                    "trade_date": mmd_base[date_col].dt.normalize(),
                    "maturity_bucket": bucket,
                    "benchmark_rating": rating,
                    "mmd_tenor": tenor,
                    "benchmark_yield": benchmark_yield,
                    "rating_spread_bps": RATING_SPREADS.get(rating, RATING_SPREADS["AAA"]).get(tenor, 0.00) * 100,
                }
            )
        )

    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def build_spread_observations(
    market_df: pd.DataFrame,
    mmd_df: pd.DataFrame,
    issuer: str,
    rating: str,
) -> pd.DataFrame:
    """Build daily issuer spread observations by maturity bucket.

    Spread is calculated in basis points:
    (average issuer trade yield - synthetic benchmark yield) * 100.
    """
    required_cols = {"issuer", "trade_date", "maturity_bucket", "yield"}
    if market_df.empty or mmd_df.empty or not required_cols.issubset(set(market_df.columns)):
        return pd.DataFrame()

    issuer_df = market_df[market_df["issuer"] == issuer].copy()
    issuer_df = issuer_df[issuer_df["maturity_bucket"].isin(["Short", "10Y", "20Y", "30Y"])]
    if issuer_df.empty:
        return pd.DataFrame()

    issuer_df["trade_date"] = pd.to_datetime(issuer_df["trade_date"], errors="coerce").dt.normalize()
    issuer_df["yield"] = pd.to_numeric(issuer_df["yield"], errors="coerce")
    issuer_df = issuer_df.dropna(subset=["trade_date", "yield", "maturity_bucket"])

    daily_issuer = (
        issuer_df.groupby(["trade_date", "maturity_bucket"], as_index=False)
        .agg(
            avg_yield=("yield", "mean"),
            trade_count=("yield", "count"),
            total_trade_amount=("trade_amount", "sum") if "trade_amount" in issuer_df.columns else ("yield", "count"),
        )
    )

    benchmark_long = make_benchmark_long(mmd_df, rating)
    if benchmark_long.empty:
        return pd.DataFrame()

    spread_obs = daily_issuer.merge(
        benchmark_long,
        on=["trade_date", "maturity_bucket"],
        how="inner",
    )
    if spread_obs.empty:
        return pd.DataFrame()

    spread_obs["spread_to_benchmark_bps"] = (
        spread_obs["avg_yield"] - spread_obs["benchmark_yield"]
    ) * 100
    return spread_obs.sort_values(["maturity_bucket", "trade_date"])


def build_spread_movement_heatmap_data(
    spread_obs: pd.DataFrame,
    windows: dict[str, int] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return heatmap matrix and audit table for spread movement.

    For each maturity bucket and lookback window:
    Spread movement = latest available spread - historical spread at/before target date.

    Positive value means widening; negative value means tightening.
    """
    if windows is None:
        windows = {"1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365}

    maturity_order = ["Short", "10Y", "20Y", "30Y"]
    matrix = pd.DataFrame(index=maturity_order, columns=list(windows.keys()), dtype="float")
    audit_rows = []

    if spread_obs.empty:
        return matrix, pd.DataFrame(audit_rows)

    obs = spread_obs.copy()
    obs["trade_date"] = pd.to_datetime(obs["trade_date"], errors="coerce").dt.normalize()
    obs = obs.dropna(subset=["trade_date", "spread_to_benchmark_bps"])

    for bucket in maturity_order:
        bucket_obs = obs[obs["maturity_bucket"] == bucket].sort_values("trade_date")
        if bucket_obs.empty:
            continue

        latest_row = bucket_obs.iloc[-1]
        latest_date = latest_row["trade_date"]
        latest_spread = latest_row["spread_to_benchmark_bps"]

        for label, days in windows.items():
            target_date = latest_date - pd.Timedelta(days=days)
            historical_candidates = bucket_obs[bucket_obs["trade_date"] <= target_date]
            if historical_candidates.empty:
                audit_rows.append(
                    {
                        "maturity_bucket": bucket,
                        "window": label,
                        "latest_date": latest_date,
                        "latest_spread_bps": latest_spread,
                        "target_date": target_date,
                        "historical_date": pd.NaT,
                        "historical_spread_bps": pd.NA,
                        "spread_movement_bps": pd.NA,
                        "note": "No historical observation at or before target date",
                    }
                )
                continue

            historical_row = historical_candidates.iloc[-1]
            historical_date = historical_row["trade_date"]
            historical_spread = historical_row["spread_to_benchmark_bps"]
            movement = latest_spread - historical_spread
            matrix.loc[bucket, label] = movement
            audit_rows.append(
                {
                    "maturity_bucket": bucket,
                    "window": label,
                    "latest_date": latest_date,
                    "latest_spread_bps": latest_spread,
                    "target_date": target_date,
                    "historical_date": historical_date,
                    "historical_spread_bps": historical_spread,
                    "spread_movement_bps": movement,
                    "note": "Positive = widening; negative = tightening",
                }
            )

    return matrix, pd.DataFrame(audit_rows)


def _normalize_col_name(name: object) -> str:
    """Normalize external column names so Munipro/Excel variants can be detected."""
    text = str(name).strip().lower()
    for ch in ["_", "-", "/", "\\", "\n", "\t"]:
        text = text.replace(ch, " ")
    return " ".join(text.split())


def _find_column(df: pd.DataFrame, canonical_name: str) -> str | None:
    """Return the actual uploaded column matching a canonical internal field."""
    normalized_columns = {_normalize_col_name(c): c for c in df.columns}
    aliases = COLUMN_ALIASES.get(canonical_name, [canonical_name])
    for alias in aliases:
        hit = normalized_columns.get(_normalize_col_name(alias))
        if hit is not None:
            return hit
    return None


def build_column_mapping(df: pd.DataFrame, expected_fields: list[str]) -> dict[str, str | None]:
    return {field: _find_column(df, field) for field in expected_fields}


def validate_dataset(
    df: pd.DataFrame,
    dataset_name: str,
    required_fields: list[str],
    recommended_fields: list[str],
    optional_fields: list[str] | None = None,
) -> dict:
    """Create a file-readiness report without blocking on non-critical fields."""
    optional_fields = optional_fields or []
    all_fields = required_fields + recommended_fields + optional_fields
    mapping = build_column_mapping(df, all_fields)

    missing_required = [field for field in required_fields if mapping.get(field) is None]
    missing_recommended = [field for field in recommended_fields if mapping.get(field) is None]
    detected_required = [field for field in required_fields if mapping.get(field) is not None]
    detected_recommended = [field for field in recommended_fields if mapping.get(field) is not None]

    return {
        "dataset": dataset_name,
        "can_run": len(missing_required) == 0,
        "row_count": len(df),
        "column_count": len(df.columns),
        "mapping": mapping,
        "missing_required": missing_required,
        "missing_recommended": missing_recommended,
        "detected_required": detected_required,
        "detected_recommended": detected_recommended,
    }


def validate_basic_values(df: pd.DataFrame, mapping: dict[str, str | None], dataset_type: str) -> list[str]:
    """Soft data-quality checks. These generate warnings instead of killing the app."""
    warnings: list[str] = []

    cusip_col = mapping.get("cusip")
    if cusip_col and cusip_col in df.columns:
        blank_cusips = df[cusip_col].isna().sum() + (df[cusip_col].astype(str).str.strip() == "").sum()
        if blank_cusips:
            warnings.append(f"{blank_cusips:,} row(s) have blank CUSIP values.")

    date_field = "maturity" if dataset_type == "bond" else "trade_date"
    date_col = mapping.get(date_field)
    if date_col and date_col in df.columns:
        parsed = pd.to_datetime(df[date_col], errors="coerce")
        bad_dates = parsed.isna().sum()
        if bad_dates:
            warnings.append(f"{bad_dates:,} row(s) have invalid or blank {date_field} values.")

    yield_col = mapping.get("yield")
    if yield_col and yield_col in df.columns:
        parsed_yield = pd.to_numeric(df[yield_col], errors="coerce")
        bad_yields = parsed_yield.isna().sum()
        extreme_yields = ((parsed_yield < -5) | (parsed_yield > 30)).sum()
        if bad_yields:
            warnings.append(f"{bad_yields:,} row(s) have non-numeric yield values.")
        if extreme_yields:
            warnings.append(f"{extreme_yields:,} row(s) have yield values outside the expected -5% to 30% range.")

    amount_col = mapping.get("trade_amount") or mapping.get("outstanding_amount")
    if amount_col and amount_col in df.columns:
        parsed_amount = pd.to_numeric(df[amount_col], errors="coerce")
        negative_amounts = (parsed_amount < 0).sum()
        if negative_amounts:
            warnings.append(f"{negative_amounts:,} row(s) have negative amount values.")

    return warnings


def display_validation_report(title: str, report: dict, warnings: list[str] | None = None):
    """Render a user-facing readiness card in Streamlit."""
    warnings = warnings or []
    status_icon = "✅" if report["can_run"] else "❌"
    with st.expander(f"{status_icon} {title} readiness check", expanded=not report["can_run"]):
        st.caption(f"Rows: {report['row_count']:,} · Columns: {report['column_count']:,}")

        c1, c2, c3 = st.columns(3)
        c1.metric("Required detected", f"{len(report['detected_required'])}/{len(report['detected_required']) + len(report['missing_required'])}")
        c2.metric("Recommended detected", f"{len(report['detected_recommended'])}/{len(report['detected_recommended']) + len(report['missing_recommended'])}")
        c3.metric("Ready to run", "Yes" if report["can_run"] else "No")

        if report["missing_required"]:
            st.error("Missing required fields: " + ", ".join(report["missing_required"]))
        if report["missing_recommended"]:
            st.warning("Missing recommended fields: " + ", ".join(report["missing_recommended"]))
        if warnings:
            for warning in warnings:
                st.warning(warning)

        mapping_rows = [
            {"Internal Field": key, "Uploaded Column Detected": value or "—"}
            for key, value in report["mapping"].items()
        ]
        st.dataframe(pd.DataFrame(mapping_rows), use_container_width=True, hide_index=True)


def template_download_button(columns: list[str], label: str, filename: str):
    template = pd.DataFrame(columns=columns)
    st.download_button(
        label=label,
        data=template.to_csv(index=False).encode("utf-8"),
        file_name=filename,
        mime="text/csv",
    )


@st.cache_data(show_spinner="Processing uploaded data...")
def process_uploads(
    bond_bytes: bytes,
    bond_name: str,
    trade_payloads: list[tuple[str, bytes]],
    issuer_mapping_payload: tuple[str, bytes] | None,
    mmd_payload: tuple[str, bytes] | None,
):
    bond_file = io.BytesIO(bond_bytes)
    raw_bonds = read_uploaded_file(bond_file, bond_name)
    bonds_df = standardize_bonds(raw_bonds)

    issuer_mapping_df = pd.DataFrame()
    if issuer_mapping_payload is not None:
        name, payload = issuer_mapping_payload
        raw_mapping = read_uploaded_file(io.BytesIO(payload), name)
        issuer_mapping_df = standardize_issuer_mapping(raw_mapping)

    issuer_master = build_issuer_master(bonds_df, issuer_mapping_df)

    trade_frames = []
    failed_files = []
    for trade_name, trade_bytes in trade_payloads:
        try:
            raw_trade = read_uploaded_file(io.BytesIO(trade_bytes), trade_name)
            trade_frames.append(standardize_trades(raw_trade, source_file=trade_name))
        except Exception as exc:
            failed_files.append((trade_name, str(exc)))

    trades_df = pd.concat(trade_frames, ignore_index=True) if trade_frames else pd.DataFrame()
    market_df = merge_market_data(bonds_df, trades_df, issuer_master)

    mmd_df = pd.DataFrame()
    if mmd_payload is not None:
        name, payload = mmd_payload
        raw_mmd = read_uploaded_file(io.BytesIO(payload), name)
        mmd_df = standardize_mmd(raw_mmd)

    return bonds_df, trades_df, issuer_master, market_df, mmd_df, failed_files


def dataframe_download_button(df: pd.DataFrame, label: str, filename: str):
    if df.empty:
        return
    csv = df.to_csv(index=False).encode("utf-8")
    st.download_button(label=label, data=csv, file_name=filename, mime="text/csv")


with st.sidebar:
    st.header("1. Upload Data")
    bond_file = st.file_uploader("Bond Master File — required", type=["csv", "xlsx", "xls"])
    trade_files = st.file_uploader("Trade History File(s) — required", type=["csv", "xlsx", "xls"], accept_multiple_files=True)
    issuer_mapping_file = st.file_uploader("Issuer / Sector Mapping — optional", type=["csv", "xlsx", "xls"])
    mmd_file = st.file_uploader("MMD Curve File — optional", type=["csv", "xlsx", "xls"])

    st.markdown("---")
    st.caption("Tip: Keep proprietary raw exports out of public GitHub. Upload them only during your own session.")

    with st.expander("Download blank templates"):
        template_download_button(BOND_REQUIRED + BOND_RECOMMENDED + BOND_OPTIONAL, "Bond template CSV", "bond_master_template.csv")
        template_download_button(TRADE_REQUIRED + TRADE_RECOMMENDED + TRADE_OPTIONAL, "Trade template CSV", "trade_history_template.csv")

if bond_file is None or not trade_files:
    st.info("Upload a bond master file and at least one trade-history file to generate the dashboard.")
    with st.expander("Expected file logic"):
        st.write(
            "The app standardizes CUSIP fields, merges trades to bonds, infers issuer from the bond master when possible, "
            "and falls back to the trade filename as an issuer guess when no bond match exists."
        )
    st.stop()

bond_bytes = bond_file.getvalue()
trade_payloads = [(f.name, f.getvalue()) for f in trade_files]
issuer_mapping_payload = (issuer_mapping_file.name, issuer_mapping_file.getvalue()) if issuer_mapping_file else None
mmd_payload = (mmd_file.name, mmd_file.getvalue()) if mmd_file else None

# -----------------------------------------------------------------------------
# File-readiness gate: inspect the uploaded files before running full analytics.
# -----------------------------------------------------------------------------
st.header("File Readiness Check")
raw_bonds_preview = read_uploaded_file(io.BytesIO(bond_bytes), bond_file.name)
bond_report = validate_dataset(raw_bonds_preview, bond_file.name, BOND_REQUIRED, BOND_RECOMMENDED, BOND_OPTIONAL)
bond_warnings = validate_basic_values(raw_bonds_preview, bond_report["mapping"], dataset_type="bond")
display_validation_report("Bond Master File", bond_report, bond_warnings)

trade_reports = []
trade_blocking_failures = []
for trade_name, trade_bytes in trade_payloads:
    try:
        raw_trade_preview = read_uploaded_file(io.BytesIO(trade_bytes), trade_name)
        report = validate_dataset(raw_trade_preview, trade_name, TRADE_REQUIRED, TRADE_RECOMMENDED, TRADE_OPTIONAL)
        warnings = validate_basic_values(raw_trade_preview, report["mapping"], dataset_type="trade")
        trade_reports.append(report)
        display_validation_report(f"Trade File — {trade_name}", report, warnings)
        if not report["can_run"]:
            trade_blocking_failures.append(trade_name)
    except Exception as exc:
        st.error(f"Could not read trade file {trade_name}: {exc}")
        trade_blocking_failures.append(trade_name)

if not bond_report["can_run"] or trade_blocking_failures:
    st.error(
        "The dashboard cannot run yet because at least one required file is missing minimum fields. "
        "Use the readiness tables above to rename/add columns, then upload again."
    )
    st.stop()

if mmd_payload is not None:
    try:
        mmd_name, mmd_bytes = mmd_payload
        raw_mmd_preview = read_uploaded_file(io.BytesIO(mmd_bytes), mmd_name)
        mmd_report = validate_dataset(raw_mmd_preview, mmd_name, MMD_REQUIRED, MMD_RECOMMENDED, [])
        display_validation_report("MMD Curve File", mmd_report)
        if not mmd_report["can_run"]:
            st.warning("MMD comparison will be skipped unless the MMD file has a date column.")
    except Exception as exc:
        st.warning(f"Could not validate MMD file. MMD comparison may be skipped: {exc}")

with st.expander("Methodology: how the app decides whether a file is usable", expanded=False):
    st.markdown(
        """
- **Required fields** are the minimum fields needed for the dashboard to run.
- **Recommended fields** improve liquidity, callable-bond, tax, and relative-value analysis, but missing them should not break the app.
- **Column aliases** let the app recognize variants like `CUSIP9`, `Cusip`, or `CUSIP` as the same internal `cusip` field.
- **Warnings** flag data-quality issues, but the app only stops when a required field is missing.
        """
    )

bonds_df, trades_df, issuer_master, market_df, mmd_df, failed_files = process_uploads(
    bond_bytes=bond_bytes,
    bond_name=bond_file.name,
    trade_payloads=trade_payloads,
    issuer_mapping_payload=issuer_mapping_payload,
    mmd_payload=mmd_payload,
)

if failed_files:
    with st.warning("Some trade files failed to process."):
        st.write(failed_files)

if bonds_df.empty:
    st.error("No usable bonds found. Please check that your bond master includes CUSIP and maturity fields.")
    st.stop()

if market_df.empty:
    st.error("No usable trade rows found. Please check that trade files include CUSIP and trade date fields.")
    st.stop()

uploaded_issuers = sorted(market_df["issuer"].dropna().astype(str).unique().tolist())

if not uploaded_issuers:
    st.error("No issuer names were detected from the uploaded files. Please check the issuer field in the bond master or trade filenames.")
    st.stop()

st.success(
    f"Processed {len(bonds_df):,} bonds and {len(market_df):,} merged trade rows "
    f"from {len(trade_files):,} trade file(s). Detected {len(uploaded_issuers):,} issuer(s)."
)

with st.sidebar:
    st.header("2. Select From Uploaded Issuers")
    selected_issuer = st.selectbox(
        "Issuer detected from uploaded files",
        uploaded_issuers,
        help="This list is generated only from the files you uploaded in Section 1."
    )
    maturity_bucket = st.selectbox("Maturity Bucket", ["All", "Short", "10Y", "20Y", "30Y"])
    time_window = st.selectbox("Time Window", ["All", "1Y", "3Y", "5Y"])
    show_raw_tables = st.checkbox("Show raw tables", value=False)

issuer_bonds = bonds_df[bonds_df["issuer"] == selected_issuer].copy()
issuer_trades = market_df[market_df["issuer"] == selected_issuer].copy()

selected_sector = "Unknown"
if "sector" in market_df.columns:
    sector_values = issuer_trades["sector"].dropna().astype(str).unique().tolist()
    if sector_values:
        selected_sector = sector_values[0]
elif "sector" in issuer_master.columns:
    sector_values = issuer_master.loc[issuer_master["issuer"] == selected_issuer, "sector"].dropna().astype(str).unique().tolist()
    if sector_values:
        selected_sector = sector_values[0]

if not issuer_trades.empty and maturity_bucket != "All":
    issuer_trades = issuer_trades[issuer_trades["maturity_bucket"] == maturity_bucket].copy()

if not issuer_trades.empty and time_window != "All":
    latest_date = issuer_trades["trade_date"].max()
    years = {"1Y": 1, "3Y": 3, "5Y": 5}[time_window]
    issuer_trades = issuer_trades[issuer_trades["trade_date"] >= latest_date - pd.DateOffset(years=years)].copy()

st.header("Executive Snapshot")
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Sector", selected_sector)
col2.metric("Issuer", selected_issuer)
col3.metric("Bonds", f"{len(issuer_bonds):,}")
col4.metric("Trades", f"{len(issuer_trades):,}")
col5.metric("Latest Trade", issuer_trades["trade_date"].max().strftime("%Y-%m-%d") if not issuer_trades.empty else "No trades")

st.header("Yield Trend / Relative Value Comparison")
with st.expander("Methodology: benchmark curve framework", expanded=False):
    st.markdown(
        """
This section groups uploaded trade rows by **trade date** and **issuer**, then plots average observed trade yield.

**Benchmark logic:**

- **AAA Curve = uploaded MMD curve.**
- **AA+/AA/AA-/A+/A/A-/BBB Curves = MMD + transparent rating-spread assumptions.**
- Spread assumptions are **maturity-adjusted**. For example, the 30Y AA spread can be wider than the 5Y AA spread.
- Units in the code are percentage points: `0.10 = 10 bps`.
- This is an internal analytical benchmark, not a live Bloomberg/BVAL/ICE curve. Replace the assumptions with firm-approved or vendor curves when available.
        """
    )
    st.dataframe(rating_spread_table(), use_container_width=True, hide_index=True)

issuer_choices = uploaded_issuers
default_compare = [selected_issuer] if selected_issuer in issuer_choices else issuer_choices[:1]
compare_issuers = st.multiselect("Compare Issuers", issuer_choices, default=default_compare)
compare_bucket = st.selectbox("Comparison Maturity Bucket", ["All", "Short", "10Y", "20Y", "30Y"], key="compare_bucket")
benchmark_ratings = st.multiselect(
    "Benchmark Curve(s)",
    BENCHMARK_RATINGS,
    default=["AAA", "AA"],
    help="AAA is the uploaded MMD curve. Other ratings are approximated as MMD plus the visible rating-spread assumptions above.",
)
show_spread_to_benchmark = st.checkbox(
    "Show issuer spread to selected benchmark",
    value=True,
    help="Calculates average issuer yield minus selected benchmark curve for dates where both are available.",
)

chart_df = market_df[market_df["issuer"].isin(compare_issuers)].copy()
if compare_bucket != "All":
    chart_df = chart_df[chart_df["maturity_bucket"] == compare_bucket].copy()

if chart_df.empty:
    st.warning("No trade data found for selected comparison filters.")
else:
    date_min = chart_df["trade_date"].min().date()
    date_max = chart_df["trade_date"].max().date()
    selected_dates = st.date_input("Trade Date Range", value=(date_min, date_max), min_value=date_min, max_value=date_max)
    if isinstance(selected_dates, tuple) and len(selected_dates) == 2:
        start_date, end_date = selected_dates
        chart_df = chart_df[(chart_df["trade_date"].dt.date >= start_date) & (chart_df["trade_date"].dt.date <= end_date)].copy()

    daily = (
        chart_df.groupby(["trade_date", "issuer"], as_index=False)
        .agg(avg_yield=("yield", "mean"), trade_count=("yield", "count"), total_trade_amount=("trade_amount", "sum"))
    )
    fig = px.line(
        daily.sort_values("trade_date"),
        x="trade_date",
        y="avg_yield",
        color="issuer",
        markers=True,
        hover_data=["trade_count", "total_trade_amount"],
        title="Average Trade Yield by Issuer",
    )

    benchmark_daily = pd.DataFrame()
    benchmark_ready = False
    if not mmd_df.empty and benchmark_ratings:
        date_col = "Date" if "Date" in mmd_df.columns else "date" if "date" in mmd_df.columns else None
        mmd_col = MMD_BUCKET_MAP.get(compare_bucket, "10Y")
        if date_col and mmd_col in mmd_df.columns:
            mmd_plot = mmd_df.copy()
            mmd_plot[date_col] = pd.to_datetime(mmd_plot[date_col], errors="coerce")
            mmd_plot = mmd_plot.dropna(subset=[date_col])
            if isinstance(selected_dates, tuple) and len(selected_dates) == 2:
                mmd_plot = mmd_plot[(mmd_plot[date_col].dt.date >= start_date) & (mmd_plot[date_col].dt.date <= end_date)]

            benchmark_frames = []
            for rating in benchmark_ratings:
                y = benchmark_curve_from_mmd(mmd_plot, mmd_col, rating)
                fig.add_scatter(
                    x=mmd_plot[date_col],
                    y=y,
                    mode="lines",
                    name=f"{rating} Curve ({mmd_col})",
                )
                benchmark_frames.append(
                    pd.DataFrame({
                        "trade_date": mmd_plot[date_col].dt.normalize(),
                        "benchmark_rating": rating,
                        "benchmark_yield": y,
                        "mmd_tenor": mmd_col,
                        "rating_spread_bps": RATING_SPREADS.get(rating, RATING_SPREADS["AAA"]).get(mmd_col, 0.00) * 100,
                    })
                )
            benchmark_daily = pd.concat(benchmark_frames, ignore_index=True) if benchmark_frames else pd.DataFrame()
            benchmark_ready = not benchmark_daily.empty
        else:
            st.warning(f"MMD benchmark could not be plotted because the file does not contain a usable date column and {mmd_col} tenor column.")

    fig.update_layout(xaxis_title="Trade Date", yaxis_title="Yield (%)", hovermode="x unified")
    st.plotly_chart(fig, use_container_width=True)

    if show_spread_to_benchmark and benchmark_ready and not daily.empty:
        spread_base = daily.copy()
        spread_base["trade_date"] = pd.to_datetime(spread_base["trade_date"], errors="coerce").dt.normalize()
        spread_to_benchmark = spread_base.merge(benchmark_daily, on="trade_date", how="inner")
        if spread_to_benchmark.empty:
            st.info("No overlapping dates were found between issuer trades and the selected benchmark curve.")
        else:
            spread_to_benchmark["spread_to_benchmark_bps"] = (
                spread_to_benchmark["avg_yield"] - spread_to_benchmark["benchmark_yield"]
            ) * 100
            spread_fig = px.line(
                spread_to_benchmark.sort_values("trade_date"),
                x="trade_date",
                y="spread_to_benchmark_bps",
                color="issuer",
                line_dash="benchmark_rating",
                markers=True,
                hover_data=["benchmark_rating", "mmd_tenor", "rating_spread_bps", "trade_count", "total_trade_amount"],
                title="Issuer Spread to Selected Benchmark Curve(s)",
            )
            spread_fig.update_layout(xaxis_title="Trade Date", yaxis_title="Spread to Benchmark (bps)", hovermode="x unified")
            st.plotly_chart(spread_fig, use_container_width=True)

            with st.expander("Spread-to-benchmark calculation details", expanded=False):
                st.markdown(
                    """
For each issuer/date/rating benchmark:

`Spread to Benchmark (bps) = (Average Issuer Trade Yield - Synthetic Benchmark Yield) × 100`

Where:

`Synthetic Benchmark Yield = MMD Tenor Yield + Rating Spread Assumption`
                    """
                )
                st.dataframe(
                    spread_to_benchmark[[
                        "trade_date", "issuer", "benchmark_rating", "mmd_tenor", "avg_yield",
                        "benchmark_yield", "rating_spread_bps", "spread_to_benchmark_bps",
                        "trade_count", "total_trade_amount",
                    ]].sort_values(["trade_date", "issuer", "benchmark_rating"], ascending=[False, True, True]).head(1000),
                    use_container_width=True,
                    hide_index=True,
                )
    elif show_spread_to_benchmark and mmd_df.empty:
        st.info("Upload an MMD curve file to enable AAA/AA/A/BBB benchmark curves and spread-to-benchmark analytics.")

st.header("Spread Movement Heatmap")
with st.expander("Methodology: spread movement heatmap", expanded=False):
    st.markdown(
        """
This heatmap shows whether the selected issuer has become richer or cheaper versus the selected benchmark curve.

**Calculation:**

`Issuer Spread = (Average Issuer Trade Yield - Synthetic Benchmark Yield) × 100`

`Spread Movement = Latest Available Issuer Spread - Historical Issuer Spread`

**How to read it:**

- **Positive / red = widening**: issuer spread increased versus the benchmark; the issuer/bucket became cheaper or underperformed.
- **Negative / green = tightening**: issuer spread decreased versus the benchmark; the issuer/bucket became richer or outperformed.
- Rows are maturity buckets. Columns are lookback windows.
- Because municipal bonds can trade sparsely, the historical value uses the latest available observation at or before the lookback target date.
        """
    )

if mmd_df.empty:
    st.info("Upload an MMD curve file to enable the spread movement heatmap.")
else:
    heatmap_col1, heatmap_col2 = st.columns([1, 2])
    with heatmap_col1:
        heatmap_rating = st.selectbox(
            "Heatmap Benchmark Curve",
            BENCHMARK_RATINGS,
            index=BENCHMARK_RATINGS.index("AAA") if "AAA" in BENCHMARK_RATINGS else 0,
            help="AAA uses uploaded MMD directly. Other ratings use MMD plus the visible rating-spread assumptions.",
        )
    with heatmap_col2:
        st.caption(
            "Cells show change in spread, in basis points, from the latest available observation to each lookback window."
        )

    heatmap_spread_obs = build_spread_observations(
        market_df=market_df,
        mmd_df=mmd_df,
        issuer=selected_issuer,
        rating=heatmap_rating,
    )

    if heatmap_spread_obs.empty:
        st.warning(
            "No overlapping issuer trade dates and benchmark dates were found for the heatmap. "
            "Check that the MMD file has Date plus 5Y/10Y/20Y/30Y columns, and that trade dates overlap with the MMD history."
        )
    else:
        heatmap_matrix, heatmap_audit = build_spread_movement_heatmap_data(heatmap_spread_obs)
        if heatmap_matrix.isna().all().all():
            st.info("Not enough historical spread observations to calculate movement across the selected windows yet.")
        else:
            heatmap_text = heatmap_matrix.applymap(lambda x: "" if pd.isna(x) else f"{x:+.1f} bp")
            heatmap_fig = px.imshow(
                heatmap_matrix.astype(float),
                x=heatmap_matrix.columns,
                y=heatmap_matrix.index,
                color_continuous_scale=["#1a9850", "#f7f7f7", "#d73027"],
                color_continuous_midpoint=0,
                aspect="auto",
                title=f"{selected_issuer} Spread Movement vs {heatmap_rating} Curve",
                labels={"x": "Lookback Window", "y": "Maturity Bucket", "color": "Spread Movement (bps)"},
            )
            heatmap_fig.update_traces(text=heatmap_text.values, texttemplate="%{text}", hovertemplate="Maturity=%{y}<br>Window=%{x}<br>Movement=%{z:.1f} bp<extra></extra>")
            heatmap_fig.update_layout(height=420)
            st.plotly_chart(heatmap_fig, use_container_width=True)

            latest_obs_date = heatmap_spread_obs["trade_date"].max()
            st.caption(
                f"Latest available spread observation used: {latest_obs_date.strftime('%Y-%m-%d')}. "
                "Positive values indicate spread widening; negative values indicate spread tightening."
            )

            with st.expander("Heatmap calculation audit table", expanded=False):
                display_cols = [
                    "maturity_bucket", "window", "latest_date", "latest_spread_bps", "target_date",
                    "historical_date", "historical_spread_bps", "spread_movement_bps", "note",
                ]
                audit_display = heatmap_audit[[c for c in display_cols if c in heatmap_audit.columns]].copy()
                for c in ["latest_spread_bps", "historical_spread_bps", "spread_movement_bps"]:
                    if c in audit_display.columns:
                        audit_display[c] = pd.to_numeric(audit_display[c], errors="coerce").round(2)
                st.dataframe(audit_display, use_container_width=True, hide_index=True)

st.header("Liquidity / Trading Frequency Analysis")
with st.expander("Methodology", expanded=False):
    st.write("Liquidity score is a transparent ranking measure: 35% trade count, 25% total trade amount, 25% recent 90-day trades, and 15% recency. It is a screening metric, not a credit rating or valuation recommendation.")
if issuer_trades.empty:
    st.warning("No trade rows found for this issuer and filter.")
else:
    today = pd.Timestamp.today().normalize()
    liq_base = issuer_trades.copy()
    liq_base["trade_month"] = liq_base["trade_date"].dt.to_period("M").astype(str)
    liq = (
        liq_base.groupby("cusip", dropna=False)
        .agg(
            trade_count=("trade_date", "count"),
            first_trade=("trade_date", "min"),
            latest_trade=("trade_date", "max"),
            active_months=("trade_month", "nunique"),
            avg_yield=("yield", "mean"),
            min_yield=("yield", "min"),
            max_yield=("yield", "max"),
            avg_price=("price", "mean"),
            total_trade_amount=("trade_amount", "sum"),
            avg_trade_amount=("trade_amount", "mean"),
            median_trade_amount=("trade_amount", "median"),
            maturity=("maturity_bond", "first"),
            coupon=("coupon_bond", "first"),
            outstanding_amount=("outstanding_amount", "first"),
        )
        .reset_index()
    )
    liq["days_since_last_trade"] = (today - liq["latest_trade"]).dt.days
    liq["trading_period_days"] = (liq["latest_trade"] - liq["first_trade"]).dt.days.clip(lower=1)
    liq["avg_days_between_trades"] = liq["trading_period_days"] / liq["trade_count"].clip(lower=1)
    liq["avg_trades_per_month"] = liq["trade_count"] / liq["active_months"].clip(lower=1)
    recent_cutoff = today - pd.DateOffset(days=90)
    recent = liq_base[liq_base["trade_date"] >= recent_cutoff].groupby("cusip").agg(recent_90d_trades=("trade_date", "count")).reset_index()
    liq = liq.merge(recent, on="cusip", how="left")
    liq["recent_90d_trades"] = liq["recent_90d_trades"].fillna(0).astype(int)
    liq["yield_range"] = liq["max_yield"] - liq["min_yield"]
    liq["turnover_ratio"] = liq["total_trade_amount"] / liq["outstanding_amount"].replace({0: pd.NA})
    liq["liquidity_score"] = (
        liq["trade_count"].rank(pct=True) * 35
        + liq["total_trade_amount"].rank(pct=True) * 25
        + liq["recent_90d_trades"].rank(pct=True) * 25
        + (1 - liq["days_since_last_trade"].rank(pct=True)) * 15
    )
    liq["liquidity_tier"] = pd.cut(
        liq["liquidity_score"], bins=[-1, 45, 75, 101], labels=["Low Liquidity", "Medium Liquidity", "High Liquidity"]
    ).astype(str)
    liq.loc[liq["days_since_last_trade"] > 365, "liquidity_tier"] = "Stale"
    liq = liq.sort_values(["liquidity_score", "trade_count", "total_trade_amount"], ascending=False)

    monthly = liq_base.groupby("trade_month", as_index=False).agg(trade_count=("trade_date", "count"), total_trade_amount=("trade_amount", "sum"), avg_yield=("yield", "mean"))
    st.subheader("1. Market Activity Over Time")
    st.plotly_chart(px.line(monthly, x="trade_month", y="trade_count", markers=True, title="Monthly Trade Count"), use_container_width=True)

    st.subheader("2. Most Frequently Traded CUSIPs")
    st.plotly_chart(px.bar(liq.head(25), x="cusip", y="trade_count", color="liquidity_tier", title="Top 25 Most Frequently Traded CUSIPs"), use_container_width=True)

    st.subheader("3. Trade Recency / Staleness")
    st.plotly_chart(px.histogram(liq, x="days_since_last_trade", nbins=30, color="liquidity_tier", title="Distribution of Days Since Last Trade"), use_container_width=True)

    st.subheader("4. Liquidity Ranking Table")
    display_cols = [
        "cusip", "liquidity_tier", "liquidity_score", "trade_count", "recent_90d_trades", "active_months",
        "avg_trades_per_month", "avg_days_between_trades", "days_since_last_trade", "first_trade", "latest_trade",
        "avg_yield", "yield_range", "avg_price", "total_trade_amount", "avg_trade_amount", "turnover_ratio",
        "maturity", "coupon", "outstanding_amount",
    ]
    st.dataframe(liq[[c for c in display_cols if c in liq.columns]], use_container_width=True, height=500)

st.header("Bond Master / Security Reference")
bond_cols = ["issuer", "sector", "primary_type", "election", "series", "cusip", "secondary_credit", "term", "maturity", "par_amount", "outstanding_amount", "coupon", "call_date", "call_price", "fed_tax", "amt"]
st.dataframe(issuer_bonds[[c for c in bond_cols if c in issuer_bonds.columns]].sort_values(["maturity", "cusip"]), use_container_width=True)

st.header("Underlying Trade Detail")
trade_cols = ["trade_datetime", "cusip", "description", "maturity_trade", "maturity_bond", "maturity_bucket", "coupon_trade", "yield", "price", "trade_amount", "spread", "trade_type", "ratings_m_s_f"]
st.dataframe(issuer_trades[[c for c in trade_cols if c in issuer_trades.columns]].sort_values("trade_datetime", ascending=False).head(20000), use_container_width=True)

st.header("Download Outputs")
d1, d2, d3 = st.columns(3)
with d1:
    dataframe_download_button(market_df, "Download Merged Market Data CSV", "merged_market_data.csv")
with d2:
    dataframe_download_button(issuer_master, "Download Issuer Master CSV", "issuer_master.csv")
with d3:
    dataframe_download_button(bonds_df, "Download Cleaned Bonds CSV", "cleaned_bonds.csv")

if show_raw_tables:
    st.header("Raw / Processed Tables")
    st.subheader("Issuer Master")
    st.dataframe(issuer_master, use_container_width=True)
    st.subheader("All Bonds")
    st.dataframe(bonds_df, use_container_width=True)
    st.subheader("All Trades")
    st.dataframe(trades_df.head(20000), use_container_width=True)
    st.subheader("Merged Market Data")
    st.dataframe(market_df.head(20000), use_container_width=True)
