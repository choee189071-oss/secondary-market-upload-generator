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

<b>Required Columns:</b><br>
Issuer, Type, Lien, Election, Series, Cusip, Secondary Credit, Term, Maturity, Par Amount, Outstanding Amount, Coupon, Call Date, Call Price, Fed Tax, AMT

<div style='height:10px;'></div>

<b>2. Trade History File(s)</b>

<ul style='margin-top:2px; margin-bottom:6px;'>
<li>Information can be extracted from Munipro</li>
<li>Row 1 must contain column headers</li>
<li>Actual data should begin from Row 2</li>
<li>Trade files should be uploaded separately</li>
</ul>

<b>Required Columns:</b><br>
Trade Date/Time, CUSIP9, Description, Maturity Date, Trade Date, Settlement Date, Coupon, Yield, Price, Trade Amount, Calculation Date, Calculation Price, Index, Index Rate, Spread, Trade Type, Ratings M/S/F

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
issuer_choices = uploaded_issuers
default_compare = [selected_issuer] if selected_issuer in issuer_choices else issuer_choices[:1]
compare_issuers = st.multiselect("Compare Issuers", issuer_choices, default=default_compare)
compare_bucket = st.selectbox("Comparison Maturity Bucket", ["All", "Short", "10Y", "20Y", "30Y"], key="compare_bucket")

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

    if not mmd_df.empty and st.checkbox("Compare with MMD", value=True):
        date_col = "Date" if "Date" in mmd_df.columns else "date" if "date" in mmd_df.columns else None
        mmd_bucket_map = {"Short": "5Y", "10Y": "10Y", "20Y": "20Y", "30Y": "30Y", "All": "10Y"}
        mmd_col = mmd_bucket_map.get(compare_bucket, "10Y")
        if date_col and mmd_col in mmd_df.columns:
            mmd_plot = mmd_df.copy()
            if isinstance(selected_dates, tuple) and len(selected_dates) == 2:
                mmd_plot = mmd_plot[(mmd_plot[date_col].dt.date >= start_date) & (mmd_plot[date_col].dt.date <= end_date)]
            fig.add_scatter(x=mmd_plot[date_col], y=mmd_plot[mmd_col], mode="lines", name=f"MMD {mmd_col}")

    fig.update_layout(xaxis_title="Trade Date", yaxis_title="Yield (%)", hovermode="x unified")
    st.plotly_chart(fig, use_container_width=True)

st.header("Liquidity / Trading Frequency Analysis")
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
    liq["turnover_ratio"] = liq["total_trade_amount"] / liq["outstanding_amount"]
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
