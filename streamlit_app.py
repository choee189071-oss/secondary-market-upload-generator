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

st.markdown(
    """
<style>
/* Overall page polish */
.block-container {
    padding-top: 2.2rem;
    padding-bottom: 3rem;
    max-width: 1500px;
}

h1, h2, h3 {
    letter-spacing: -0.02em;
}

section[data-testid="stSidebar"] {
    min-width: 330px !important;
}

div[data-testid="stMetric"] {
    background: #ffffff;
    border: 1px solid #e6e8ef;
    border-radius: 16px;
    padding: 18px 18px 14px 18px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.clean-card {
    background: #ffffff;
    border: 1px solid #e6e8ef;
    border-radius: 18px;
    padding: 18px 20px;
    min-height: 124px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.clean-card-label {
    font-size: 0.86rem;
    font-weight: 700;
    color: #64748b;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.clean-card-value-large {
    font-size: 1.65rem;
    font-weight: 720;
    line-height: 1.15;
    color: #111827;
    overflow-wrap: anywhere;
}

.clean-card-value-small {
    font-size: 1.32rem;
    font-weight: 720;
    line-height: 1.2;
    color: #111827;
    overflow-wrap: anywhere;
}

.clean-card-note {
    font-size: 0.82rem;
    color: #94a3b8;
    margin-top: 8px;
}

.nav-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    margin: 10px 0 18px 0;
}

.nav-card a {
    text-decoration: none;
    color: #334155;
    font-size: 0.92rem;
}

.nav-card a:hover {
    color: #0f172a;
    text-decoration: underline;
}

.sidebar-nav-small {
    font-size: 0.88rem;
    line-height: 1.55;
}

/* Keep dataframes/charts visually lighter */
div[data-testid="stDataFrame"] {
    border-radius: 14px;
    overflow: hidden;
}
</style>
""",
    unsafe_allow_html=True,
)


def section_anchor(anchor_id: str, title: str, level: int = 2):
    """Create a stable HTML anchor plus a Streamlit header/subheader."""
    st.markdown(f"<a id='{anchor_id}'></a>", unsafe_allow_html=True)
    if level == 1:
        st.title(title)
    elif level == 2:
        st.header(title)
    else:
        st.subheader(title)


def clean_metric_card(label: str, value: object, size: str = "large", note: str | None = None):
    """Compact custom metric card that gives long text more room than st.metric."""
    value_class = "clean-card-value-large" if size == "large" else "clean-card-value-small"
    safe_value = "—" if value is None else str(value)
    note_html = f"<div class='clean-card-note'>{note}</div>" if note else ""
    st.markdown(
        f"""
<div class="clean-card">
  <div class="clean-card-label">{label}</div>
  <div class="{value_class}">{safe_value}</div>
  {note_html}
</div>
""",
        unsafe_allow_html=True,
    )


def section_directory():
    """Main-page clickable directory for users who miss the collapsed sidebar."""
    st.markdown(
        """
<div class="nav-card">
<b>Dashboard Directory</b><br>
<a href="#file-readiness">1. File Readiness Check</a> ·
<a href="#executive-snapshot">2. Executive Snapshot</a> ·
<a href="#yield-relative-value">3. Yield & Relative Value</a> ·
<a href="#issuer-curve">4. Issuer Curve vs Benchmark</a> ·
<a href="#spread-level">5. Current Spread Level</a> ·
<a href="#spread-movement">6. Spread Movement</a> ·
<a href="#rv-positioning">7. RV Positioning Map</a> ·
<a href="#liquidity">8. Liquidity</a> ·
<a href="#bond-master">9. Bond Master</a> ·
<a href="#trade-detail">10. Trade Detail</a> ·
<a href="#downloads">11. Downloads</a>
</div>
""",
        unsafe_allow_html=True,
    )

section_directory()


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
CURVE_TEMPLATE_COLUMNS = [
    "date", "5Y", "10Y", "20Y", "30Y",
    "AA+_5Y", "AA+_10Y", "AA+_20Y", "AA+_30Y",
    "AA_5Y", "AA_10Y", "AA_20Y", "AA_30Y",
    "AA-_5Y", "AA-_10Y", "AA-_20Y", "AA-_30Y",
    "A_5Y", "A_10Y", "A_20Y", "A_30Y",
    "BBB_5Y", "BBB_10Y", "BBB_20Y", "BBB_30Y",
]


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


def _curve_column_key(name: object) -> str:
    """Normalize curve column names for flexible matching.

    Examples that should match the same idea:
    - AA 10Y, AA_10Y, AA-10Y
    - AAA 5Y, MMD 5Y, 5Y
    - AA+ 20Y, AA Plus 20Y
    """
    text = str(name).strip().lower()
    text = text.replace("+", " plus ").replace("-", " minus ")
    keep = []
    for ch in text:
        keep.append(ch if ch.isalnum() else " ")
    return " ".join("".join(keep).split()).replace(" ", "")


def _rating_key(rating: str) -> str:
    return _curve_column_key(rating)


def find_uploaded_benchmark_column(mmd_df: pd.DataFrame, tenor: str, rating: str) -> str | None:
    """Find an explicitly uploaded benchmark column for rating + tenor.

    Priority logic:
    1. Exact user-provided curve columns, e.g. AA_10Y / AA 10Y / AA Curve 10Y.
    2. For AAA only, also allow MMD/vanilla tenor columns, e.g. 10Y.

    This lets users upload vendor/internal AA/A/BBB curves. If they do not,
    the app falls back to MMD AAA + transparent spread assumptions.
    """
    normalized = {_curve_column_key(c): c for c in mmd_df.columns}
    r = _rating_key(rating)
    t = _curve_column_key(tenor)

    candidates = [
        f"{r}{t}",
        f"{r}curve{t}",
        f"{r}yield{t}",
        f"{r}muni{t}",
        f"{r}mmd{t}",
        f"{t}{r}",
    ]

    if rating == "AAA":
        candidates.extend([
            t,
            f"mmd{t}",
            f"mmdaaa{t}",
            f"aaammd{t}",
            f"aaacurve{t}",
        ])

    for key in candidates:
        if key in normalized:
            return normalized[key]
    return None


def get_benchmark_curve(mmd_plot: pd.DataFrame, tenor: str, rating: str) -> tuple[pd.Series, dict] | tuple[None, dict]:
    """Return benchmark yield and metadata.

    Priority:
    - Use explicitly uploaded rating curve column when available.
    - Otherwise use uploaded AAA/MMD tenor column + visible rating-spread assumption.
    """
    explicit_col = find_uploaded_benchmark_column(mmd_plot, tenor, rating)
    if explicit_col is not None:
        return pd.to_numeric(mmd_plot[explicit_col], errors="coerce"), {
            "benchmark_source": "Uploaded curve",
            "source_column": explicit_col,
            "rating_spread_bps": 0.0,
        }

    base_col = find_uploaded_benchmark_column(mmd_plot, tenor, "AAA")
    if base_col is None:
        return None, {
            "benchmark_source": "Unavailable",
            "source_column": None,
            "rating_spread_bps": pd.NA,
        }

    base_curve = pd.to_numeric(mmd_plot[base_col], errors="coerce")
    spread_adjustment = RATING_SPREADS.get(rating, RATING_SPREADS["AAA"]).get(tenor, 0.00)
    return base_curve + spread_adjustment, {
        "benchmark_source": "Modeled from MMD + spread assumption" if rating != "AAA" else "Uploaded MMD / AAA curve",
        "source_column": base_col,
        "rating_spread_bps": spread_adjustment * 100,
    }


def benchmark_curve_from_mmd(mmd_plot: pd.DataFrame, mmd_col: str, rating: str) -> pd.Series:
    """Backward-compatible wrapper used by older chart blocks."""
    curve, _meta = get_benchmark_curve(mmd_plot, mmd_col, rating)
    if curve is None:
        return pd.Series([pd.NA] * len(mmd_plot), index=mmd_plot.index, dtype="float")
    return curve


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
        if bucket == "All":
            continue
        benchmark_yield, meta = get_benchmark_curve(mmd_base, tenor, rating)
        if benchmark_yield is None:
            continue
        frames.append(
            pd.DataFrame(
                {
                    "trade_date": mmd_base[date_col].dt.normalize(),
                    "maturity_bucket": bucket,
                    "benchmark_rating": rating,
                    "mmd_tenor": tenor,
                    "benchmark_yield": benchmark_yield,
                    "rating_spread_bps": meta.get("rating_spread_bps"),
                    "benchmark_source": meta.get("benchmark_source"),
                    "source_column": meta.get("source_column"),
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


def build_spread_level_data(
    market_df: pd.DataFrame,
    mmd_df: pd.DataFrame,
    issuer: str,
    ratings: list[str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return current spread level matrix and audit table.

    Matrix rows are maturity buckets; columns are benchmark ratings.
    Each cell is the latest available issuer spread to that benchmark, in bps:
        (Average Issuer Trade Yield - Synthetic Benchmark Yield) * 100

    This is different from spread movement. Spread level answers "where is
    the issuer trading now?" Movement answers "how much did it change?"
    """
    maturity_order = ["Short", "10Y", "20Y", "30Y"]
    clean_ratings = [r for r in ratings if r in BENCHMARK_RATINGS]
    matrix = pd.DataFrame(index=maturity_order, columns=clean_ratings, dtype="float")
    audit_rows: list[dict] = []

    if not clean_ratings or market_df.empty or mmd_df.empty:
        return matrix, pd.DataFrame(audit_rows)

    for rating in clean_ratings:
        spread_obs = build_spread_observations(
            market_df=market_df,
            mmd_df=mmd_df,
            issuer=issuer,
            rating=rating,
        )
        if spread_obs.empty:
            continue

        spread_obs = spread_obs.copy()
        spread_obs["trade_date"] = pd.to_datetime(spread_obs["trade_date"], errors="coerce").dt.normalize()
        spread_obs = spread_obs.dropna(subset=["trade_date", "spread_to_benchmark_bps"])

        for bucket in maturity_order:
            bucket_obs = spread_obs[spread_obs["maturity_bucket"] == bucket].sort_values("trade_date")
            if bucket_obs.empty:
                audit_rows.append(
                    {
                        "maturity_bucket": bucket,
                        "benchmark_rating": rating,
                        "latest_date": pd.NaT,
                        "avg_yield": pd.NA,
                        "benchmark_yield": pd.NA,
                        "spread_to_benchmark_bps": pd.NA,
                        "mmd_tenor": MMD_BUCKET_MAP.get(bucket),
                        "rating_spread_bps": RATING_SPREADS.get(rating, RATING_SPREADS["AAA"]).get(MMD_BUCKET_MAP.get(bucket, "10Y"), 0.00) * 100,
                        "benchmark_source": "No matching benchmark/date",
                        "source_column": pd.NA,
                        "trade_count": pd.NA,
                        "total_trade_amount": pd.NA,
                        "note": "No overlapping issuer trade and benchmark observation",
                    }
                )
                continue

            latest = bucket_obs.iloc[-1]
            spread_level = latest["spread_to_benchmark_bps"]
            matrix.loc[bucket, rating] = spread_level
            audit_rows.append(
                {
                    "maturity_bucket": bucket,
                    "benchmark_rating": rating,
                    "latest_date": latest["trade_date"],
                    "avg_yield": latest.get("avg_yield"),
                    "benchmark_yield": latest.get("benchmark_yield"),
                    "spread_to_benchmark_bps": spread_level,
                    "mmd_tenor": latest.get("mmd_tenor"),
                    "rating_spread_bps": latest.get("rating_spread_bps"),
                    "benchmark_source": latest.get("benchmark_source"),
                    "source_column": latest.get("source_column"),
                    "trade_count": latest.get("trade_count"),
                    "total_trade_amount": latest.get("total_trade_amount"),
                    "note": "Latest available spread observation for maturity bucket and benchmark",
                }
            )

    return matrix, pd.DataFrame(audit_rows)


def build_issuer_curve_snapshot(
    market_df: pd.DataFrame,
    mmd_df: pd.DataFrame,
    issuer: str,
    ratings: list[str],
    as_of_date: pd.Timestamp,
    lookback_days: int,
    aggregation_method: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build issuer yield curve vs benchmark curves by maturity bucket.

    This is a cross-sectional curve snapshot, not a time-series chart.

    Issuer curve logic:
    - Average Last N Days: average uploaded trade yield by maturity bucket over the
      lookback window ending on the selected as-of date.
    - Latest Trade Per Bucket: latest available trade observation at or before the
      selected as-of date for each maturity bucket.

    Benchmark curve logic:
    - Use uploaded rating curve columns when available.
    - Otherwise use MMD/AAA + visible rating spread assumptions.
    - For each bucket/rating, use the latest benchmark observation at or before
      the selected as-of date.
    """
    maturity_order = ["Short", "10Y", "20Y", "30Y"]
    clean_ratings = [r for r in ratings if r in BENCHMARK_RATINGS]

    if market_df.empty or mmd_df.empty or not clean_ratings:
        return pd.DataFrame(), pd.DataFrame()

    required_cols = {"issuer", "trade_date", "maturity_bucket", "yield"}
    if not required_cols.issubset(set(market_df.columns)):
        return pd.DataFrame(), pd.DataFrame()

    as_of_date = pd.to_datetime(as_of_date).normalize()
    issuer_df = market_df[market_df["issuer"] == issuer].copy()
    issuer_df = issuer_df[issuer_df["maturity_bucket"].isin(maturity_order)]
    issuer_df["trade_date"] = pd.to_datetime(issuer_df["trade_date"], errors="coerce").dt.normalize()
    issuer_df["yield"] = pd.to_numeric(issuer_df["yield"], errors="coerce")
    issuer_df = issuer_df.dropna(subset=["trade_date", "yield", "maturity_bucket"])
    issuer_df = issuer_df[issuer_df["trade_date"] <= as_of_date]
    if issuer_df.empty:
        return pd.DataFrame(), pd.DataFrame()

    if aggregation_method == "Latest trade per bucket":
        latest_rows = (
            issuer_df.sort_values(["maturity_bucket", "trade_date"])
            .groupby("maturity_bucket", as_index=False)
            .tail(1)
        )
        issuer_curve = latest_rows[["maturity_bucket", "trade_date", "yield"]].rename(
            columns={"trade_date": "issuer_observation_date", "yield": "issuer_yield"}
        )
        counts = issuer_df.groupby("maturity_bucket", as_index=False).agg(trade_count=("yield", "count"))
        issuer_curve = issuer_curve.merge(counts, on="maturity_bucket", how="left")
        issuer_curve["aggregation_method"] = aggregation_method
        issuer_curve["lookback_start"] = pd.NaT
        issuer_curve["lookback_end"] = as_of_date
    else:
        lookback_start = as_of_date - pd.Timedelta(days=int(lookback_days))
        window_df = issuer_df[(issuer_df["trade_date"] >= lookback_start) & (issuer_df["trade_date"] <= as_of_date)].copy()
        if window_df.empty:
            return pd.DataFrame(), pd.DataFrame()
        agg_dict = {
            "issuer_yield": ("yield", "mean"),
            "trade_count": ("yield", "count"),
            "issuer_observation_date": ("trade_date", "max"),
        }
        if "trade_amount" in window_df.columns:
            agg_dict["total_trade_amount"] = ("trade_amount", "sum")
        issuer_curve = window_df.groupby("maturity_bucket", as_index=False).agg(**agg_dict)
        issuer_curve["aggregation_method"] = f"Average last {lookback_days} days"
        issuer_curve["lookback_start"] = lookback_start
        issuer_curve["lookback_end"] = as_of_date

    # Preserve intuitive curve order.
    issuer_curve["maturity_bucket"] = pd.Categorical(
        issuer_curve["maturity_bucket"], categories=maturity_order, ordered=True
    )
    issuer_curve = issuer_curve.sort_values("maturity_bucket")

    date_col = _detect_mmd_date_column(mmd_df)
    if date_col is None:
        return pd.DataFrame(), pd.DataFrame()

    mmd_base = mmd_df.copy()
    mmd_base[date_col] = pd.to_datetime(mmd_base[date_col], errors="coerce").dt.normalize()
    mmd_base = mmd_base.dropna(subset=[date_col])
    mmd_base = mmd_base[mmd_base[date_col] <= as_of_date]
    if mmd_base.empty:
        return pd.DataFrame(), pd.DataFrame()

    rows = []
    for rating in clean_ratings:
        for bucket in maturity_order:
            tenor = MMD_BUCKET_MAP.get(bucket, "10Y")
            y, meta = get_benchmark_curve(mmd_base, tenor, rating)
            if y is None:
                continue
            tmp = mmd_base[[date_col]].copy()
            tmp["benchmark_yield"] = pd.to_numeric(y, errors="coerce")
            tmp = tmp.dropna(subset=["benchmark_yield"])
            if tmp.empty:
                continue
            latest_bench = tmp.iloc[-1]
            rows.append(
                {
                    "maturity_bucket": bucket,
                    "benchmark_rating": rating,
                    "benchmark_date": latest_bench[date_col],
                    "benchmark_yield": latest_bench["benchmark_yield"],
                    "mmd_tenor": tenor,
                    "benchmark_source": meta.get("benchmark_source"),
                    "source_column": meta.get("source_column"),
                    "rating_spread_bps": meta.get("rating_spread_bps"),
                }
            )

    benchmark_curve = pd.DataFrame(rows)
    if benchmark_curve.empty:
        return pd.DataFrame(), pd.DataFrame()

    curve_data = issuer_curve.merge(benchmark_curve, on="maturity_bucket", how="inner")
    if curve_data.empty:
        return pd.DataFrame(), pd.DataFrame()

    curve_data["spread_to_benchmark_bps"] = (
        curve_data["issuer_yield"] - curve_data["benchmark_yield"]
    ) * 100

    # Long format for one clean Plotly line chart.
    issuer_line = issuer_curve[["maturity_bucket", "issuer_yield", "trade_count", "issuer_observation_date"]].copy()
    issuer_line = issuer_line.rename(columns={"issuer_yield": "yield_value"})
    issuer_line["curve"] = f"{issuer} issuer curve"
    issuer_line["curve_type"] = "Issuer"

    benchmark_line = benchmark_curve.rename(columns={"benchmark_yield": "yield_value"}).copy()
    benchmark_line["curve"] = benchmark_line["benchmark_rating"].astype(str) + " benchmark curve"
    benchmark_line["curve_type"] = "Benchmark"
    benchmark_line["trade_count"] = pd.NA
    benchmark_line["issuer_observation_date"] = pd.NaT

    plot_df = pd.concat(
        [
            issuer_line[["maturity_bucket", "yield_value", "curve", "curve_type", "trade_count", "issuer_observation_date"]],
            benchmark_line[["maturity_bucket", "yield_value", "curve", "curve_type", "trade_count", "issuer_observation_date"]],
        ],
        ignore_index=True,
    )
    plot_df["maturity_bucket"] = pd.Categorical(plot_df["maturity_bucket"], categories=maturity_order, ordered=True)
    plot_df = plot_df.sort_values(["curve_type", "curve", "maturity_bucket"])

    return plot_df, curve_data


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

    # Data Health metric: remove exact duplicate trade rows before analytics.
    before_dedup = len(trades_df)
    trades_df = trades_df.drop_duplicates().reset_index(drop=True)
    duplicates_removed = before_dedup - len(trades_df)

    market_df = merge_market_data(bonds_df, trades_df, issuer_master)

    mmd_df = pd.DataFrame()
    if mmd_payload is not None:
        name, payload = mmd_payload
        raw_mmd = read_uploaded_file(io.BytesIO(payload), name)
        mmd_df = standardize_mmd(raw_mmd)

    return bonds_df, trades_df, issuer_master, market_df, mmd_df, failed_files, duplicates_removed


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
        template_download_button(CURVE_TEMPLATE_COLUMNS, "Benchmark curve template CSV", "benchmark_curve_template.csv")

    st.markdown("---")
    st.subheader("Contents")
    st.markdown(
        """
<div class="sidebar-nav-small">
<a href="#file-readiness">1. File Readiness Check</a><br>
<a href="#executive-snapshot">2. Executive Snapshot</a><br>
<a href="#yield-relative-value">3. Yield & Relative Value</a><br>
&nbsp;&nbsp;• Yield trend<br>
&nbsp;&nbsp;• Spread to benchmark<br>
<a href="#spread-level">4. Current Spread Level</a><br>
&nbsp;&nbsp;• Spread curve<br>
&nbsp;&nbsp;• Spread level heatmap<br>
<a href="#spread-movement">5. Spread Movement</a><br>
&nbsp;&nbsp;• Movement heatmap<br>
<a href="#rv-positioning">6. RV Positioning Map</a><br>
&nbsp;&nbsp;• Liquidity vs spread<br>
&nbsp;&nbsp;• Cheap/rich quadrants<br>
<a href="#liquidity">7. Liquidity Analysis</a><br>
<a href="#bond-master">8. Bond Master</a><br>
<a href="#trade-detail">9. Trade Detail</a><br>
<a href="#downloads">10. Downloads</a>
</div>
""",
        unsafe_allow_html=True,
    )

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
section_anchor("file-readiness", "File Readiness Check")
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

(
    bonds_df,
    trades_df,
    issuer_master,
    market_df,
    mmd_df,
    failed_files,
    duplicates_removed,
) = process_uploads(
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
    st.markdown("---")
    st.header("Data Health")

    if not market_df.empty and "trade_date" in market_df.columns:
        trade_dates = pd.to_datetime(market_df["trade_date"], errors="coerce").dropna()
        if not trade_dates.empty:
            earliest_trade = trade_dates.min()
            latest_trade = trade_dates.max()
            st.caption(
                f"📅 Data Coverage:\n"
                f"{earliest_trade:%Y-%m-%d} → {latest_trade:%Y-%m-%d}"
            )
        else:
            st.caption("📅 Data Coverage:\nNo valid trade dates detected")
    else:
        st.caption("📅 Data Coverage:\nNo trade data loaded")

    st.caption(
        f"📊 Trades Loaded:\n"
        f"{len(market_df):,}"
    )

    total_rows = len(market_df)
    if total_rows > 0 and "cusip" in market_df.columns:
        bond_cusips = set(bonds_df["cusip"].dropna().astype(str).str.upper()) if "cusip" in bonds_df.columns else set()
        trade_cusips = market_df["cusip"].dropna().astype(str).str.upper()
        matched_cusips_count = trade_cusips.isin(bond_cusips).sum() if bond_cusips else 0
        match_rate = matched_cusips_count / total_rows * 100
    else:
        matched_cusips_count = 0
        match_rate = 0

    match_icon = "🟢" if match_rate >= 95 else "🟡" if match_rate >= 80 else "🔴"
    st.caption(
        f"{match_icon} CUSIP Match Rate:\n"
        f"{match_rate:.1f}%"
    )

    missing_issuers = market_df["issuer"].isna().sum() if "issuer" in market_df.columns else total_rows
    missing_issuer_rate = missing_issuers / total_rows * 100 if total_rows > 0 else 0
    missing_icon = "🟢" if missing_issuers == 0 else "🟡" if missing_issuer_rate <= 5 else "🔴"
    st.caption(
        f"{missing_icon} Missing Issuers:\n"
        f"{missing_issuers:,}"
    )

    st.caption(
        f"🧹 Duplicate Trades Removed:\n"
        f"{duplicates_removed:,}"
    )

    with st.expander("Data Health methodology", expanded=False):
        st.markdown(
            """
- **Data Coverage** uses the earliest and latest valid trade dates after standardization.
- **Trades Loaded** counts merged trade rows available for analytics.
- **CUSIP Match Rate** is the share of merged trade rows whose CUSIP appears in the uploaded bond master.
- **Missing Issuers** counts rows without an issuer after the bond/trade merge and issuer-mapping logic.
- **Duplicate Trades Removed** counts exact duplicate standardized trade rows removed before analytics.
            """
        )

    st.markdown("---")
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

section_anchor("executive-snapshot", "Executive Snapshot")

latest_trade_display = (
    issuer_trades["trade_date"].max().strftime("%Y-%m-%d")
    if not issuer_trades.empty
    else "No trades"
)

# Custom cards give long sector/issuer names enough horizontal room, while keeping numeric fields quieter.
snap_col1, snap_col2, snap_col3, snap_col4, snap_col5 = st.columns([1.55, 2.15, 0.75, 0.9, 1.1])
with snap_col1:
    clean_metric_card("Sector", selected_sector, size="large")
with snap_col2:
    clean_metric_card("Issuer", selected_issuer, size="large")
with snap_col3:
    clean_metric_card("Bonds", f"{len(issuer_bonds):,}", size="small")
with snap_col4:
    clean_metric_card("Trades", f"{len(issuer_trades):,}", size="small")
with snap_col5:
    clean_metric_card("Latest Trade", latest_trade_display, size="small")

section_anchor("yield-relative-value", "Yield Trend / Relative Value Comparison")
with st.expander("Methodology: benchmark curve framework", expanded=False):
    st.markdown(
        """
This section groups uploaded trade rows by **trade date** and **issuer**, then plots average observed trade yield.

**Benchmark logic:**

- **AAA Curve = uploaded MMD / AAA curve.**
- **If users upload explicit AA+/AA/AA-/A+/A/A-/BBB curve columns, the app uses those directly.**
- **If explicit non-AAA curves are missing, the app falls back to MMD + transparent rating-spread assumptions.**
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
    help="Priority: uploaded rating curve columns first; otherwise MMD/AAA plus the visible rating-spread assumptions above.",
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
        date_col = _detect_mmd_date_column(mmd_df)
        mmd_col = MMD_BUCKET_MAP.get(compare_bucket, "10Y")
        if date_col:
            mmd_plot = mmd_df.copy()
            mmd_plot[date_col] = pd.to_datetime(mmd_plot[date_col], errors="coerce")
            mmd_plot = mmd_plot.dropna(subset=[date_col])
            if isinstance(selected_dates, tuple) and len(selected_dates) == 2:
                mmd_plot = mmd_plot[(mmd_plot[date_col].dt.date >= start_date) & (mmd_plot[date_col].dt.date <= end_date)]

            benchmark_frames = []
            unavailable_ratings = []
            for rating in benchmark_ratings:
                y, meta = get_benchmark_curve(mmd_plot, mmd_col, rating)
                if y is None:
                    unavailable_ratings.append(rating)
                    continue
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
                        "rating_spread_bps": meta.get("rating_spread_bps"),
                        "benchmark_source": meta.get("benchmark_source"),
                        "source_column": meta.get("source_column"),
                    })
                )
            benchmark_daily = pd.concat(benchmark_frames, ignore_index=True) if benchmark_frames else pd.DataFrame()
            benchmark_ready = not benchmark_daily.empty
            if unavailable_ratings:
                st.warning(
                    "Some benchmark curves could not be built because neither an uploaded curve column nor a usable AAA/MMD base tenor was found: "
                    + ", ".join(unavailable_ratings)
                )
        else:
            st.warning("Benchmark curves could not be plotted because the curve file does not contain a usable date column.")

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
                hover_data=["benchmark_rating", "mmd_tenor", "benchmark_source", "source_column", "rating_spread_bps", "trade_count", "total_trade_amount"],
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

`Benchmark Yield = uploaded rating curve if available; otherwise MMD/AAA Tenor Yield + Rating Spread Assumption`
                    """
                )
                st.dataframe(
                    spread_to_benchmark[[
                        "trade_date", "issuer", "benchmark_rating", "mmd_tenor", "avg_yield",
                        "benchmark_yield", "benchmark_source", "source_column", "rating_spread_bps", "spread_to_benchmark_bps",
                        "trade_count", "total_trade_amount",
                    ]].sort_values(["trade_date", "issuer", "benchmark_rating"], ascending=[False, True, True]).head(1000),
                    use_container_width=True,
                    hide_index=True,
                )
    elif show_spread_to_benchmark and mmd_df.empty:
        st.info("Upload an MMD curve file to enable AAA/AA/A/BBB benchmark curves and spread-to-benchmark analytics.")


section_anchor("issuer-curve", "Issuer Curve vs Benchmark Curve")
with st.expander("Methodology: issuer curve vs benchmark curve", expanded=False):
    st.markdown(
        """
This chart shows a **cross-sectional yield curve** by maturity bucket, rather than a time-series trend.

**Issuer curve logic:**

- The issuer curve is built from uploaded trade yields by maturity bucket: **Short / 10Y / 20Y / 30Y**.
- Default aggregation uses **average yield over the latest selected window** ending on the curve date. This reduces noise from sparse municipal trading.
- You can also use **latest trade per bucket** when you want the most recent observation in each maturity bucket.

**Benchmark curve logic:**

- The benchmark curve uses uploaded rating curve columns when available.
- If an uploaded AA/A/BBB curve is missing, the app falls back to **MMD/AAA + transparent rating-spread assumptions**.
- The benchmark value uses the latest available curve observation at or before the selected curve date.

**How to read it:**

- If the issuer line is above the benchmark line, the issuer trades cheaper / wider for that bucket.
- If the issuer line is below the benchmark line, the issuer trades richer / tighter for that bucket.
- The accompanying table shows exact yields and spreads in basis points.
        """
    )

if mmd_df.empty:
    st.info("Upload an MMD / benchmark curve file to enable Issuer Curve vs Benchmark Curve analysis.")
else:
    selected_issuer_dates = pd.to_datetime(
        market_df.loc[market_df["issuer"] == selected_issuer, "trade_date"], errors="coerce"
    ).dropna()

    if selected_issuer_dates.empty:
        st.warning("No valid trade dates were found for the selected issuer, so the issuer curve cannot be built.")
    else:
        curve_min_date = selected_issuer_dates.min().date()
        curve_max_date = selected_issuer_dates.max().date()

        curve_ctrl1, curve_ctrl2, curve_ctrl3 = st.columns([1, 1, 1.4])
        with curve_ctrl1:
            curve_as_of_date = st.date_input(
                "Curve Date",
                value=curve_max_date,
                min_value=curve_min_date,
                max_value=curve_max_date,
                key="issuer_curve_as_of_date",
                help="The issuer and benchmark curves use observations available at or before this date.",
            )
        with curve_ctrl2:
            curve_aggregation = st.selectbox(
                "Issuer Curve Aggregation",
                ["Average last N days", "Latest trade per bucket"],
                index=0,
                key="issuer_curve_aggregation",
            )
        with curve_ctrl3:
            curve_benchmark_ratings = st.multiselect(
                "Benchmark Curve(s) for Curve Chart",
                BENCHMARK_RATINGS,
                default=[r for r in ["AAA", "AA"] if r in BENCHMARK_RATINGS],
                key="issuer_curve_benchmark_ratings",
                help="Priority: uploaded rating curve columns first; otherwise MMD/AAA plus the visible spread assumptions.",
            )

        curve_lookback_days = 30
        if curve_aggregation == "Average last N days":
            curve_lookback_days = st.select_slider(
                "Lookback Window for Issuer Curve",
                options=[7, 14, 30, 60, 90, 180],
                value=30,
                format_func=lambda x: f"{x} days",
                key="issuer_curve_lookback_days",
                help="Municipal trades can be sparse, so averaging over a window usually gives a more stable curve than using one day only.",
            )

        if not curve_benchmark_ratings:
            st.info("Select at least one benchmark curve to display the issuer curve comparison.")
        else:
            issuer_curve_plot_df, issuer_curve_audit = build_issuer_curve_snapshot(
                market_df=market_df,
                mmd_df=mmd_df,
                issuer=selected_issuer,
                ratings=curve_benchmark_ratings,
                as_of_date=pd.Timestamp(curve_as_of_date),
                lookback_days=curve_lookback_days,
                aggregation_method=curve_aggregation,
            )

            if issuer_curve_plot_df.empty or issuer_curve_audit.empty:
                st.warning(
                    "No overlapping issuer trades and benchmark curve observations were found for this curve setup. "
                    "Try a longer lookback window, a different curve date, or check that the benchmark file has usable 5Y/10Y/20Y/30Y columns."
                )
            else:
                curve_fig = px.line(
                    issuer_curve_plot_df,
                    x="maturity_bucket",
                    y="yield_value",
                    color="curve",
                    markers=True,
                    hover_data=["curve_type", "trade_count", "issuer_observation_date"],
                    title=f"{selected_issuer} Issuer Curve vs Benchmark Curve(s)",
                    labels={
                        "maturity_bucket": "Maturity Bucket",
                        "yield_value": "Yield (%)",
                        "curve": "Curve",
                    },
                )
                curve_fig.update_layout(hovermode="x unified", height=500)
                st.plotly_chart(curve_fig, use_container_width=True)

                table_cols = [
                    "maturity_bucket", "benchmark_rating", "issuer_yield", "benchmark_yield",
                    "spread_to_benchmark_bps", "trade_count", "issuer_observation_date", "benchmark_date",
                    "mmd_tenor", "benchmark_source", "source_column", "rating_spread_bps",
                    "aggregation_method", "lookback_start", "lookback_end",
                ]
                curve_table = issuer_curve_audit[[c for c in table_cols if c in issuer_curve_audit.columns]].copy()
                for c in ["issuer_yield", "benchmark_yield", "spread_to_benchmark_bps", "rating_spread_bps"]:
                    if c in curve_table.columns:
                        curve_table[c] = pd.to_numeric(curve_table[c], errors="coerce").round(2)

                st.subheader("Curve Spread Table")
                st.dataframe(curve_table, use_container_width=True, hide_index=True)

                primary_curve_rating = curve_benchmark_ratings[0]
                primary_rows = issuer_curve_audit[issuer_curve_audit["benchmark_rating"] == primary_curve_rating].copy()
                primary_rows = primary_rows.dropna(subset=["spread_to_benchmark_bps"])
                if not primary_rows.empty:
                    cheap_row = primary_rows.loc[primary_rows["spread_to_benchmark_bps"].idxmax()]
                    rich_row = primary_rows.loc[primary_rows["spread_to_benchmark_bps"].idxmin()]
                    st.info(
                        f"Curve read-through vs {primary_curve_rating}: "
                        f"{cheap_row['maturity_bucket']} is the widest bucket at {cheap_row['spread_to_benchmark_bps']:+.1f} bp, "
                        f"while {rich_row['maturity_bucket']} is the tightest bucket at {rich_row['spread_to_benchmark_bps']:+.1f} bp."
                    )


section_anchor("spread-level", "Current Spread Level Framework")
with st.expander("Methodology: current spread level", expanded=False):
    st.markdown(
        """
This section shows where the selected issuer is trading **now** versus transparent benchmark curves.

**Calculation:**

`Current Spread Level = (Average Issuer Trade Yield - Benchmark Yield) × 100`

Where:

`Benchmark Yield = uploaded rating curve if available; otherwise MMD/AAA Curve + Rating Spread Assumption`

**How to read it:**

- **Positive spread**: issuer yield is above the selected benchmark curve; the issuer/bucket is trading cheaper than that benchmark.
- **Negative spread**: issuer yield is below the selected benchmark curve; the issuer/bucket is trading richer than that benchmark.
- Rows are maturity buckets. Columns are benchmark curves.
- This is a **level** view, not a movement view. Level answers: *is it cheap or rich right now?* Movement answers: *did it widen or tighten recently?*
        """
    )

if mmd_df.empty:
    st.info("Upload an MMD curve file to enable current spread level analytics.")
else:
    level_col1, level_col2 = st.columns([1, 2])
    with level_col1:
        level_ratings = st.multiselect(
            "Spread Level Benchmark Curves",
            BENCHMARK_RATINGS,
            default=[r for r in ["AAA", "AA", "A", "BBB"] if r in BENCHMARK_RATINGS],
            help="Priority: uploaded rating curve columns first; otherwise MMD/AAA plus the visible rating-spread assumptions.",
        )
    with level_col2:
        st.caption(
            "Cells show latest available issuer spread to each benchmark curve, in basis points. "
            "Higher positive values generally indicate cheaper relative value versus that benchmark."
        )

    if not level_ratings:
        st.info("Select at least one benchmark curve to display current spread levels.")
    else:
        level_matrix, level_audit = build_spread_level_data(
            market_df=market_df,
            mmd_df=mmd_df,
            issuer=selected_issuer,
            ratings=level_ratings,
        )
        if level_matrix.isna().all().all():
            st.warning(
                "No overlapping issuer trade dates and benchmark dates were found for current spread levels. "
                "Check that the curve file has a Date column plus either 5Y/10Y/20Y/30Y base columns or explicit rating curve columns such as AA_10Y, and that trade dates overlap with the curve history."
            )
        else:
            level_text = level_matrix.map(lambda x: "" if pd.isna(x) else f"{x:+.1f} bp")

            # 1) Spread level curve: one line per selected benchmark rating.
            curve_df = level_matrix.reset_index().rename(columns={"index": "maturity_bucket"})
            curve_long = curve_df.melt(
                id_vars="maturity_bucket",
                var_name="benchmark_rating",
                value_name="spread_to_benchmark_bps",
            ).dropna(subset=["spread_to_benchmark_bps"])
            curve_long["maturity_bucket"] = pd.Categorical(
                curve_long["maturity_bucket"],
                categories=["Short", "10Y", "20Y", "30Y"],
                ordered=True,
            )
            curve_long = curve_long.sort_values(["benchmark_rating", "maturity_bucket"])

            st.subheader("1. Current Spread Curve")
            level_curve_fig = px.line(
                curve_long,
                x="maturity_bucket",
                y="spread_to_benchmark_bps",
                color="benchmark_rating",
                markers=True,
                title=f"{selected_issuer} Current Spread Curve vs Selected Benchmarks",
                labels={
                    "maturity_bucket": "Maturity Bucket",
                    "spread_to_benchmark_bps": "Spread to Benchmark (bps)",
                    "benchmark_rating": "Benchmark Curve",
                },
            )
            level_curve_fig.add_hline(y=0, line_dash="dash", opacity=0.5)
            level_curve_fig.update_layout(hovermode="x unified")
            st.plotly_chart(level_curve_fig, use_container_width=True)

            # 2) Spread level heatmap: maturity bucket x benchmark rating.
            st.subheader("2. Current Spread Level Heatmap")
            level_heatmap_fig = px.imshow(
                level_matrix.astype(float),
                x=level_matrix.columns,
                y=level_matrix.index,
                color_continuous_scale=["#1a9850", "#f7f7f7", "#d73027"],
                color_continuous_midpoint=0,
                aspect="auto",
                title=f"{selected_issuer} Current Spread Level vs Benchmark Curves",
                labels={"x": "Benchmark Curve", "y": "Maturity Bucket", "color": "Current Spread (bps)"},
            )
            level_heatmap_fig.update_traces(
                text=level_text.values,
                texttemplate="%{text}",
                hovertemplate="Maturity=%{y}<br>Benchmark=%{x}<br>Spread=%{z:.1f} bp<extra></extra>",
            )
            level_heatmap_fig.update_layout(height=420)
            st.plotly_chart(level_heatmap_fig, use_container_width=True)

            # 3) Quick signal: identify the cheapest bucket vs the first selected benchmark.
            primary_rating = level_ratings[0]
            if primary_rating in level_matrix.columns and level_matrix[primary_rating].notna().any():
                cheapest_bucket = level_matrix[primary_rating].astype(float).idxmax()
                cheapest_spread = level_matrix.loc[cheapest_bucket, primary_rating]
                richest_bucket = level_matrix[primary_rating].astype(float).idxmin()
                richest_spread = level_matrix.loc[richest_bucket, primary_rating]
                st.info(
                    f"Relative value read-through vs {primary_rating}: "
                    f"{cheapest_bucket} appears cheapest at {cheapest_spread:+.1f} bp, "
                    f"while {richest_bucket} appears richest at {richest_spread:+.1f} bp."
                )

            with st.expander("Current spread level audit table", expanded=False):
                display_cols = [
                    "maturity_bucket", "benchmark_rating", "latest_date", "avg_yield", "benchmark_yield",
                    "spread_to_benchmark_bps", "mmd_tenor", "benchmark_source", "source_column", "rating_spread_bps", "trade_count",
                    "total_trade_amount", "note",
                ]
                audit_display = level_audit[[c for c in display_cols if c in level_audit.columns]].copy()
                for c in ["avg_yield", "benchmark_yield", "spread_to_benchmark_bps", "rating_spread_bps"]:
                    if c in audit_display.columns:
                        audit_display[c] = pd.to_numeric(audit_display[c], errors="coerce").round(2)
                st.dataframe(audit_display, use_container_width=True, hide_index=True)

section_anchor("spread-movement", "Spread Movement Heatmap")
with st.expander("Methodology: spread movement heatmap", expanded=False):
    st.markdown(
        """
This heatmap shows whether the selected issuer has become richer or cheaper versus the selected benchmark curve.

**Calculation:**

`Issuer Spread = (Average Issuer Trade Yield - Benchmark Yield) × 100`

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
            help="Priority: uploaded rating curve columns first; otherwise MMD/AAA plus the visible rating-spread assumptions.",
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
            "Check that the curve file has a Date column plus either 5Y/10Y/20Y/30Y base columns or explicit rating curve columns such as AA_10Y, and that trade dates overlap with the curve history."
        )
    else:
        heatmap_matrix, heatmap_audit = build_spread_movement_heatmap_data(heatmap_spread_obs)
        if heatmap_matrix.isna().all().all():
            st.info("Not enough historical spread observations to calculate movement across the selected windows yet.")
        else:
            heatmap_text = heatmap_matrix.map(lambda x: "" if pd.isna(x) else f"{x:+.1f} bp")
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


section_anchor("rv-positioning", "Relative Value Positioning Map")
with st.expander("Methodology: relative value positioning map", expanded=False):
    st.markdown(
        """
This scatter plot maps individual CUSIPs by **tradability** and **relative value**.

**Default interpretation:**

- **X-axis = Liquidity Score**: higher means more actively traded, larger traded amount, more recent activity, and less staleness.
- **Y-axis = Spread to Benchmark**: higher means the bond is trading cheaper versus the selected benchmark curve.
- **Bubble size = Total Trade Amount**: larger dots indicate more secondary-market trading volume.
- **Color = Maturity Bucket**: Short / 10Y / 20Y / 30Y.

**Quadrants:**

- **Upper-right:** cheap and liquid; often the first area to investigate.
- **Upper-left:** cheap but illiquid; may require a liquidity premium.
- **Lower-right:** liquid but rich; useful benchmark-like bonds.
- **Lower-left:** illiquid and rich; usually less attractive from a relative-value screen.

This is a **screening view**, not an investment recommendation. It helps analysts identify bonds worth deeper review.
        """
    )

if issuer_trades.empty:
    st.warning("No trade rows found for this issuer and filter.")
else:
    rv_controls = st.columns([1, 1, 1, 1])
    with rv_controls[0]:
        rv_benchmark_rating = st.selectbox(
            "RV Benchmark Curve",
            BENCHMARK_RATINGS,
            index=BENCHMARK_RATINGS.index("AAA") if "AAA" in BENCHMARK_RATINGS else 0,
            key="rv_benchmark_rating",
            help="Used only when Y-axis is spread to benchmark. Uploaded curve columns are used first; otherwise MMD + assumption spread.",
        )
    with rv_controls[1]:
        rv_y_axis = st.selectbox(
            "Y-axis",
            ["Spread to Benchmark (bps)", "Average Yield (%)"],
            index=0,
            key="rv_y_axis",
        )
    with rv_controls[2]:
        rv_size_by = st.selectbox(
            "Bubble size",
            ["Total Trade Amount", "Outstanding Amount", "Trade Count"],
            index=0,
            key="rv_size_by",
        )
    with rv_controls[3]:
        rv_min_trades = st.number_input(
            "Minimum Trades",
            min_value=1,
            max_value=100,
            value=1,
            step=1,
            key="rv_min_trades",
        )

    rv_base = issuer_trades.copy()
    rv_base["trade_date"] = pd.to_datetime(rv_base["trade_date"], errors="coerce").dt.normalize()
    rv_base["yield"] = pd.to_numeric(rv_base["yield"], errors="coerce")
    if "trade_amount" in rv_base.columns:
        rv_base["trade_amount"] = pd.to_numeric(rv_base["trade_amount"], errors="coerce")
    else:
        rv_base["trade_amount"] = pd.NA
    if "price" in rv_base.columns:
        rv_base["price"] = pd.to_numeric(rv_base["price"], errors="coerce")
    else:
        rv_base["price"] = pd.NA

    rv_base = rv_base.dropna(subset=["cusip", "trade_date", "yield"])

    if rv_base.empty:
        st.warning("No usable CUSIP-level trade rows are available for the positioning map.")
    else:
        today_rv = pd.Timestamp.today().normalize()
        rv_base["trade_month"] = rv_base["trade_date"].dt.to_period("M").astype(str)
        rv_summary = (
            rv_base.groupby("cusip", dropna=False)
            .agg(
                avg_yield=("yield", "mean"),
                latest_yield=("yield", "last"),
                avg_price=("price", "mean"),
                trade_count=("trade_date", "count"),
                first_trade=("trade_date", "min"),
                latest_trade=("trade_date", "max"),
                active_months=("trade_month", "nunique"),
                total_trade_amount=("trade_amount", "sum"),
                avg_trade_amount=("trade_amount", "mean"),
                maturity_bucket=("maturity_bucket", "first"),
                maturity=("maturity_bond", "first"),
                coupon=("coupon_bond", "first"),
                outstanding_amount=("outstanding_amount", "first"),
                description=("description", "first") if "description" in rv_base.columns else ("yield", "count"),
            )
            .reset_index()
        )
        rv_summary["days_since_last_trade"] = (today_rv - rv_summary["latest_trade"]).dt.days
        rv_summary["trading_period_days"] = (rv_summary["latest_trade"] - rv_summary["first_trade"]).dt.days.clip(lower=1)
        rv_summary["avg_days_between_trades"] = rv_summary["trading_period_days"] / rv_summary["trade_count"].clip(lower=1)
        rv_summary["avg_trades_per_month"] = rv_summary["trade_count"] / rv_summary["active_months"].clip(lower=1)

        recent_cutoff_rv = today_rv - pd.DateOffset(days=90)
        rv_recent = (
            rv_base[rv_base["trade_date"] >= recent_cutoff_rv]
            .groupby("cusip")
            .agg(recent_90d_trades=("trade_date", "count"))
            .reset_index()
        )
        rv_summary = rv_summary.merge(rv_recent, on="cusip", how="left")
        rv_summary["recent_90d_trades"] = rv_summary["recent_90d_trades"].fillna(0).astype(int)

        for numeric_col in ["total_trade_amount", "outstanding_amount", "avg_trade_amount"]:
            if numeric_col in rv_summary.columns:
                rv_summary[numeric_col] = pd.to_numeric(rv_summary[numeric_col], errors="coerce")
        rv_summary["turnover_ratio"] = rv_summary["total_trade_amount"] / rv_summary["outstanding_amount"].replace({0: pd.NA})
        rv_summary["liquidity_score"] = (
            rv_summary["trade_count"].rank(pct=True) * 35
            + rv_summary["total_trade_amount"].fillna(0).rank(pct=True) * 25
            + rv_summary["recent_90d_trades"].rank(pct=True) * 25
            + (1 - rv_summary["days_since_last_trade"].rank(pct=True)) * 15
        )
        rv_summary["liquidity_tier"] = pd.cut(
            rv_summary["liquidity_score"],
            bins=[-1, 45, 75, 101],
            labels=["Low Liquidity", "Medium Liquidity", "High Liquidity"],
        ).astype(str)
        rv_summary.loc[rv_summary["days_since_last_trade"] > 365, "liquidity_tier"] = "Stale"

        rv_summary = rv_summary[rv_summary["trade_count"] >= rv_min_trades].copy()

        # Add benchmark spread at each CUSIP's latest trade date and maturity bucket.
        if rv_y_axis == "Spread to Benchmark (bps)":
            if mmd_df.empty:
                st.info("Upload an MMD / benchmark curve file to use Spread to Benchmark. Showing Average Yield instead.")
                rv_y_axis_col = "avg_yield"
                rv_y_axis_label = "Average Yield (%)"
            else:
                benchmark_long_rv = make_benchmark_long(mmd_df, rv_benchmark_rating)
                if benchmark_long_rv.empty:
                    st.info("No usable benchmark curve was found for the selected rating. Showing Average Yield instead.")
                    rv_y_axis_col = "avg_yield"
                    rv_y_axis_label = "Average Yield (%)"
                else:
                    benchmark_long_rv = benchmark_long_rv.sort_values(["maturity_bucket", "trade_date"])
                    merge_frames = []
                    for bucket in ["Short", "10Y", "20Y", "30Y"]:
                        left = rv_summary[rv_summary["maturity_bucket"] == bucket].sort_values("latest_trade")
                        right = benchmark_long_rv[benchmark_long_rv["maturity_bucket"] == bucket].sort_values("trade_date")
                        if left.empty or right.empty:
                            continue
                        merged_bucket = pd.merge_asof(
                            left,
                            right,
                            left_on="latest_trade",
                            right_on="trade_date",
                            direction="backward",
                            tolerance=pd.Timedelta(days=14),
                        )
                        merge_frames.append(merged_bucket)
                    if merge_frames:
                        rv_summary = pd.concat(merge_frames, ignore_index=True)
                        rv_summary["spread_to_benchmark_bps"] = (
                            rv_summary["avg_yield"] - rv_summary["benchmark_yield"]
                        ) * 100
                        rv_y_axis_col = "spread_to_benchmark_bps"
                        rv_y_axis_label = "Spread to Benchmark (bps)"
                    else:
                        st.info("No overlapping CUSIP latest-trade dates and benchmark dates were found. Showing Average Yield instead.")
                        rv_y_axis_col = "avg_yield"
                        rv_y_axis_label = "Average Yield (%)"
        else:
            rv_y_axis_col = "avg_yield"
            rv_y_axis_label = "Average Yield (%)"

        rv_summary = rv_summary.dropna(subset=["liquidity_score", rv_y_axis_col])

        if rv_summary.empty:
            st.warning("No CUSIPs meet the selected filters for the positioning map.")
        else:
            size_map = {
                "Total Trade Amount": "total_trade_amount",
                "Outstanding Amount": "outstanding_amount",
                "Trade Count": "trade_count",
            }
            size_col = size_map.get(rv_size_by, "total_trade_amount")

            # Defensive plotting layer -------------------------------------------------
            # Plotly scatter is sensitive to missing/non-numeric/negative values in
            # size, x, and y columns. Muni exports often have blank outstanding amount,
            # missing trade amount, or unmatched benchmark values, so we clean the data
            # before plotting instead of letting the whole app crash.
            rv_plot = rv_summary.copy()

            for numeric_col in ["liquidity_score", rv_y_axis_col, size_col]:
                if numeric_col in rv_plot.columns:
                    rv_plot[numeric_col] = pd.to_numeric(rv_plot[numeric_col], errors="coerce")
                    rv_plot[numeric_col] = rv_plot[numeric_col].replace([float("inf"), -float("inf")], pd.NA)

            required_plot_cols = ["liquidity_score", rv_y_axis_col]
            rv_plot = rv_plot.dropna(subset=[c for c in required_plot_cols if c in rv_plot.columns])

            if "maturity_bucket" not in rv_plot.columns:
                rv_plot["maturity_bucket"] = "Unknown"
            else:
                rv_plot["maturity_bucket"] = rv_plot["maturity_bucket"].fillna("Unknown").astype(str)

            if "cusip" not in rv_plot.columns:
                rv_plot["cusip"] = rv_plot.index.astype(str)
            else:
                rv_plot["cusip"] = rv_plot["cusip"].fillna("Unknown").astype(str)

            if size_col not in rv_plot.columns:
                rv_plot["point_size"] = 10
                size_col = "point_size"
            else:
                rv_plot[size_col] = pd.to_numeric(rv_plot[size_col], errors="coerce")
                rv_plot[size_col] = rv_plot[size_col].replace([float("inf"), -float("inf")], pd.NA)
                rv_plot[size_col] = rv_plot[size_col].fillna(0).clip(lower=0)

                if rv_plot[size_col].sum() <= 0:
                    rv_plot["point_size"] = 10
                    size_col = "point_size"

            hover_cols = [
                "cusip", "maturity_bucket", "maturity", "coupon", "avg_yield", "avg_price",
                "trade_count", "recent_90d_trades", "days_since_last_trade", "total_trade_amount",
                "outstanding_amount", "turnover_ratio", "liquidity_tier",
            ]
            if "spread_to_benchmark_bps" in rv_plot.columns:
                hover_cols.extend(["spread_to_benchmark_bps", "benchmark_yield", "benchmark_source", "source_column"])
            hover_cols = [c for c in hover_cols if c in rv_plot.columns]

            if rv_plot.empty:
                st.warning(
                    "No valid observations remain after cleaning the positioning-map inputs. "
                    "Try lowering the minimum trade filter or using Average Yield instead of Spread to Benchmark."
                )
            else:
                try:
                    rv_fig = px.scatter(
                        rv_plot,
                        x="liquidity_score",
                        y=rv_y_axis_col,
                        size=size_col,
                        size_max=38,
                        color="maturity_bucket",
                        hover_name="cusip",
                        hover_data=hover_cols,
                        title=f"{selected_issuer} Relative Value Positioning Map",
                        labels={
                            "liquidity_score": "Liquidity Score",
                            rv_y_axis_col: rv_y_axis_label,
                            "maturity_bucket": "Maturity Bucket",
                            size_col: rv_size_by if size_col != "point_size" else "Fixed Point Size",
                        },
                    )
                    median_liquidity = rv_plot["liquidity_score"].median()
                    median_y = rv_plot[rv_y_axis_col].median()
                    if pd.notna(median_liquidity):
                        rv_fig.add_vline(x=median_liquidity, line_dash="dash", opacity=0.45)
                    if pd.notna(median_y):
                        rv_fig.add_hline(y=median_y, line_dash="dash", opacity=0.45)
                    rv_fig.update_layout(height=560, hovermode="closest")
                    st.plotly_chart(rv_fig, use_container_width=True)
                except Exception as exc:
                    st.warning(
                        "The positioning map could not be plotted because the scatter inputs were not usable. "
                        f"The cleaned data table is shown below for review. Error: {exc}"
                    )
                    st.dataframe(rv_plot.head(1000), use_container_width=True, hide_index=True)

                # Use the cleaned plotting data for quadrant/read-through logic.
                rv_summary = rv_plot
                median_liquidity = rv_summary["liquidity_score"].median()
                median_y = rv_summary[rv_y_axis_col].median()

            if rv_y_axis_col == "spread_to_benchmark_bps":
                candidates = rv_summary[
                    (rv_summary["liquidity_score"] >= median_liquidity)
                    & (rv_summary["spread_to_benchmark_bps"] >= median_y)
                ].sort_values(["spread_to_benchmark_bps", "liquidity_score"], ascending=False)
                if not candidates.empty:
                    top = candidates.iloc[0]
                    st.info(
                        f"Positioning read-through: {top['cusip']} screens as relatively cheap and liquid "
                        f"at {top['spread_to_benchmark_bps']:+.1f} bp versus {rv_benchmark_rating}, "
                        f"with a liquidity score of {top['liquidity_score']:.1f}."
                    )

            with st.expander("Positioning map data table", expanded=False):
                display_cols = [
                    "cusip", "maturity_bucket", "liquidity_score", "liquidity_tier", rv_y_axis_col,
                    "avg_yield", "benchmark_yield", "benchmark_source", "source_column", "trade_count",
                    "recent_90d_trades", "days_since_last_trade", "total_trade_amount", "outstanding_amount",
                    "turnover_ratio", "maturity", "coupon", "avg_price",
                ]
                display_cols = [c for c in display_cols if c in rv_summary.columns]
                rv_display = rv_summary[display_cols].copy()
                for c in ["liquidity_score", rv_y_axis_col, "avg_yield", "benchmark_yield", "turnover_ratio", "avg_price"]:
                    if c in rv_display.columns:
                        rv_display[c] = pd.to_numeric(rv_display[c], errors="coerce").round(2)
                st.dataframe(
                    rv_display.sort_values([rv_y_axis_col, "liquidity_score"], ascending=False),
                    use_container_width=True,
                    hide_index=True,
                    height=420,
                )

section_anchor("liquidity", "Liquidity / Trading Frequency Analysis")
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

section_anchor("bond-master", "Bond Master / Security Reference")
bond_cols = ["issuer", "sector", "primary_type", "election", "series", "cusip", "secondary_credit", "term", "maturity", "par_amount", "outstanding_amount", "coupon", "call_date", "call_price", "fed_tax", "amt"]
st.dataframe(issuer_bonds[[c for c in bond_cols if c in issuer_bonds.columns]].sort_values(["maturity", "cusip"]), use_container_width=True)

section_anchor("trade-detail", "Underlying Trade Detail")
trade_cols = ["trade_datetime", "cusip", "description", "maturity_trade", "maturity_bond", "maturity_bucket", "coupon_trade", "yield", "price", "trade_amount", "spread", "trade_type", "ratings_m_s_f"]
st.dataframe(issuer_trades[[c for c in trade_cols if c in issuer_trades.columns]].sort_values("trade_datetime", ascending=False).head(20000), use_container_width=True)

section_anchor("downloads", "Download Outputs")
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
