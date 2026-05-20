from __future__ import annotations

import re
from pathlib import Path
from typing import BinaryIO, Optional

import pandas as pd


def clean_colname(col: object) -> str:
    return (
        str(col)
        .strip()
        .lower()
        .replace("/", "_")
        .replace(" ", "_")
        .replace("-", "_")
    )


def clean_money_series(s: pd.Series) -> pd.Series:
    return (
        s.astype(str)
        .str.replace("$", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.replace("%", "", regex=False)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "None": pd.NA})
    )


def clean_numeric(s: pd.Series) -> pd.Series:
    return pd.to_numeric(clean_money_series(s), errors="coerce")


def clean_cusip(s: pd.Series) -> pd.Series:
    return (
        s.astype(str)
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
        .replace({"nan": pd.NA, "": pd.NA, "None": pd.NA})
    )


def infer_issuer_from_filename(filename: str | None) -> object:
    if not filename:
        return pd.NA
    stem = Path(filename).stem
    stem = re.sub(r"[_\-\s]*(Trade|Trades|trade|trades)\s*$", "", stem)
    return stem.replace("_", " ").strip()


def read_uploaded_file(uploaded_file: BinaryIO, filename: str) -> pd.DataFrame:
    """Read CSV/XLS/XLSX uploaded through Streamlit."""
    suffix = Path(filename).suffix.lower()
    if suffix in [".xlsx", ".xls"]:
        try:
            return pd.read_excel(uploaded_file, sheet_name="ag-grid", dtype=str)
        except Exception:
            uploaded_file.seek(0)
            return pd.read_excel(uploaded_file, dtype=str)
    return pd.read_csv(uploaded_file, dtype=str)


def standardize_bonds(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [clean_colname(c) for c in df.columns]

    rename_map = {
        "cusip": "cusip",
        "cusip9": "cusip",
        "issuer": "issuer",
        "secondary_credit": "secondary_credit",
        "maturity": "maturity",
        "maturity_date": "maturity",
        "par_amount": "par_amount",
        "outstanding_amount": "outstanding_amount",
        "coupon": "coupon",
        "call_date": "call_date",
        "call_price": "call_price",
        "fed_tax": "fed_tax",
        "tax_status": "fed_tax",
        "amt": "amt",
        "series": "series",
        "election": "election",
        "type": "type",
        "lien": "lien",
        "term": "term",
        "sector": "sector",
        "primary_type": "primary_type",
    }
    df = df.rename(columns={c: rename_map.get(c, c) for c in df.columns})

    required_cols = [
        "issuer", "type", "lien", "election", "series", "cusip",
        "secondary_credit", "term", "maturity", "par_amount",
        "outstanding_amount", "coupon", "call_date", "call_price",
        "fed_tax", "amt", "sector", "primary_type",
    ]
    for col in required_cols:
        if col not in df.columns:
            df[col] = pd.NA

    df["cusip"] = clean_cusip(df["cusip"])
    df["issuer"] = df["issuer"].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})
    df["sector"] = df["sector"].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})
    df["primary_type"] = df["primary_type"].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})

    for col in ["series", "secondary_credit", "term", "type", "lien", "election", "fed_tax", "amt"]:
        df[col] = df[col].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})

    df["maturity"] = pd.to_datetime(df["maturity"], errors="coerce")
    df["call_date"] = pd.to_datetime(df["call_date"], errors="coerce")

    for col in ["par_amount", "outstanding_amount", "coupon", "call_price"]:
        df[col] = clean_numeric(df[col])

    df = df[df["cusip"].notna()].copy()
    df = df[df["maturity"].notna()].copy()

    today = pd.Timestamp.today().normalize()
    df["years_to_maturity"] = (df["maturity"] - today).dt.days / 365.25
    return df[required_cols + ["years_to_maturity"]]


def standardize_trades(df: pd.DataFrame, source_file: Optional[str] = None) -> pd.DataFrame:
    df = df.copy()
    df.columns = [clean_colname(c) for c in df.columns]

    rename_map = {
        "trade_date_time": "trade_datetime",
        "trade_datetime": "trade_datetime",
        "cusip9": "cusip",
        "cusip": "cusip",
        "description": "description",
        "maturity_date": "maturity",
        "maturity": "maturity",
        "trade_date": "trade_date",
        "settlement_date": "settlement_date",
        "coupon": "coupon",
        "yield": "yield",
        "price": "price",
        "trade_amount": "trade_amount",
        "calculation_date": "calculation_date",
        "calculation_price": "calculation_price",
        "index": "index",
        "index_rate": "index_rate",
        "spread": "spread",
        "trade_type": "trade_type",
        "ratings_m_s_f": "ratings_m_s_f",
    }
    df = df.rename(columns={c: rename_map.get(c, c) for c in df.columns})

    required_cols = [
        "trade_datetime", "cusip", "description", "maturity", "trade_date",
        "settlement_date", "coupon", "yield", "price", "trade_amount",
        "calculation_date", "calculation_price", "index", "index_rate",
        "spread", "trade_type", "ratings_m_s_f",
    ]
    for col in required_cols:
        if col not in df.columns:
            df[col] = pd.NA

    df["cusip"] = clean_cusip(df["cusip"])
    for col in ["trade_datetime", "maturity", "trade_date", "settlement_date", "calculation_date"]:
        df[col] = pd.to_datetime(df[col], errors="coerce")
    for col in ["coupon", "yield", "price", "trade_amount", "calculation_price", "index_rate", "spread"]:
        df[col] = clean_numeric(df[col])

    df["source_file"] = source_file or pd.NA
    df["source_issuer_guess"] = infer_issuer_from_filename(source_file)
    df = df[df["cusip"].notna()].copy()
    df = df[df["trade_date"].notna()].copy()
    return df[required_cols + ["source_file", "source_issuer_guess"]]


def standardize_issuer_mapping(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [clean_colname(c) for c in df.columns]
    for col in ["issuer", "sector", "primary_type", "notes"]:
        if col not in df.columns:
            df[col] = pd.NA
    df["issuer"] = df["issuer"].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})
    df["sector"] = df["sector"].astype(str).str.strip().replace({"nan": "Unassigned", "": "Unassigned"})
    df["primary_type"] = df["primary_type"].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})
    df["notes"] = df["notes"].astype(str).str.strip().replace({"nan": pd.NA, "": pd.NA})
    return df[df["issuer"].notna()][["issuer", "sector", "primary_type", "notes"]].drop_duplicates("issuer", keep="last")


def build_issuer_master(bonds_df: pd.DataFrame, issuer_mapping_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    from_bonds = bonds_df[["issuer", "sector", "primary_type"]].drop_duplicates("issuer").copy()
    from_bonds["sector"] = from_bonds["sector"].fillna("Unassigned")
    from_bonds["primary_type"] = from_bonds["primary_type"].fillna(pd.NA)
    from_bonds["notes"] = pd.NA
    if issuer_mapping_df is not None and not issuer_mapping_df.empty:
        combined = pd.concat([from_bonds, issuer_mapping_df], ignore_index=True)
    else:
        combined = from_bonds
    combined["issuer"] = combined["issuer"].astype(str).str.strip()
    combined["sector"] = combined["sector"].astype(str).str.strip().replace({"nan": "Unassigned", "": "Unassigned"})
    combined = combined[combined["issuer"] != ""].drop_duplicates("issuer", keep="last")
    return combined.sort_values(["sector", "issuer"])[["issuer", "sector", "primary_type", "notes"]]


def assign_maturity_bucket(years: float) -> object:
    if pd.isna(years):
        return pd.NA
    if years <= 7:
        return "Short"
    if years <= 15:
        return "10Y"
    if years <= 25:
        return "20Y"
    return "30Y"


def merge_market_data(bonds_df: pd.DataFrame, trades_df: pd.DataFrame, issuer_master: pd.DataFrame) -> pd.DataFrame:
    bonds = bonds_df.drop(columns=["sector", "primary_type"], errors="ignore").merge(
        issuer_master[["issuer", "sector", "primary_type"]], on="issuer", how="left"
    )
    bonds["sector"] = bonds["sector"].fillna("Unassigned")

    if trades_df.empty:
        return pd.DataFrame()

    market_df = trades_df.merge(bonds, on="cusip", how="left", suffixes=("_trade", "_bond"))
    if "issuer" not in market_df.columns:
        market_df["issuer"] = market_df["source_issuer_guess"]
    else:
        market_df["issuer"] = market_df["issuer"].fillna(market_df["source_issuer_guess"])
    market_df["sector"] = market_df["sector"].fillna("Unassigned")
    market_df["years_to_maturity_at_trade"] = (
        market_df["maturity_bond"].fillna(market_df["maturity_trade"]) - market_df["trade_date"]
    ).dt.days / 365.25
    market_df["maturity_bucket"] = market_df["years_to_maturity_at_trade"].apply(assign_maturity_bucket)
    return market_df


def standardize_mmd(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.replace("-Yr", "Y", regex=False)
        .str.replace("Yr", "Y", regex=False)
        .str.replace("-YR", "Y", regex=False)
        .str.replace("YR", "Y", regex=False)
        .str.replace("-", "", regex=False)
    )
    date_col = "Date" if "Date" in df.columns else "date" if "date" in df.columns else None
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    return df
