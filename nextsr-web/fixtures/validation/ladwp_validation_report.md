# LADWP Golden Sample Validation Report

## Status

This report makes `LADWP.xlsx + mmd.csv` the human-readable golden sample baseline for NextSR validation. The JSON fixture remains the machine-readable regression snapshot.

## Source Files

| Item | Value |
| --- | --- |
| Canonical trade file | `LADWP.xlsx` |
| Trade file used in this run | `LADWP.xlsx` |
| MMD file used in this run | `mmd.csv` |
| Trade detected format | `xlsx` |
| MMD detected format | `csv` |
| Trade source rows | 47,057 |
| MMD source rows | 598 |

## Data Reconciliation

| Metric | Value |
| --- | ---: |
| Raw/source trade rows | 47,057 |
| Model-ready trade rows | 41,269 |
| Rows excluded before model-ready universe | 5,788 |
| CUSIP count | 216 |
| Benchmark source | Uploaded AAA MMD |
| Uploaded AAA MMD points | 17,940 |
| Trade index fallback points | 9,097 |
| Fallback points used | 0 |

## Core Output Snapshot

| Metric | Value |
| --- | --- |
| Issuer | LADWP |
| Maturity bucket | 12Y |
| As of date | 2026-05-22 |
| Label | Neutral / Needs More Evidence |
| Current spread | 57.98 bps |
| Spread change | 4.62 bps |
| Historical percentile | 50.5% |
| Liquidity score | 100 |
| Liquidity trade count | 90 |
| Liquidity par amount | $29,490,002 |
| Flow imbalance | N/A |

## Top CUSIP Screener

| Rank | CUSIP | Signal | Bucket | Screener Spread | Liquidity | RV Score | Trades | Total Par |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 544532NV2 | Wide + Liquid | 14Y | 63.26 bps | 91.2 | 92.5 | 28 | $3,845,000 |
| 2 | 544532PU2 | Wide + Liquid | 25Y | 46.82 bps | 92.9 | 88.2 | 37 | $7,890,000 |
| 3 | 544532LV4 | Wide + Liquid | 13Y | 54.91 bps | 82.9 | 87.3 | 22 | $2,495,000 |
| 4 | 544532NG5 | Wide + Liquid | 22Y | 39.37 bps | 92.3 | 83.8 | 49 | $4,370,000 |
| 5 | 544532SC9 | Wide + Liquid | 25Y | 45.38 bps | 77.5 | 82.4 | 42 | $4,980,000 |

## Selected Top CUSIP Detail

| Metric | Value |
| --- | --- |
| CUSIP | 544532NV2 |
| Detail trade count | 410 |
| Detail total par | $176,330,000 |
| Latest yield | 3.83% |
| Latest price | 108.09 |
| Detail spread | 68.8 bps |
| Trade path points returned | 45 |

## Peer RV And Cross-Issuer RV

| Metric | Value |
| --- | --- |
| Current peer bucket | 12Y |
| Issuer spread in current bucket | 57.98 bps |
| Peer median spread | N/A |
| Peer gap | N/A |
| Issuer trade count in bucket | 6 |
| Peer issuer count | 0 |

| Issuer | Sector | Avg Spread | Liquidity | Trades | CUSIPs | RV Score | Latest Trade |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| LADWP | Unknown | 40.11 bps | 63 | 41,269 | 216 | 63.4 | 2026-05-26 |

## Report Export Checks

| Check | Value |
| --- | --- |
| PDF header | `%PDF-1.4` |
| PDF bytes | 6,831 |
| PPTX header | `PK\x03\x04` |
| PPTX bytes | 34,994 |
| PPTX includes slide 8 | Yes |
| PPTX includes theme XML | Yes |
| Slide count | 8 |

| Slide | Title |
| ---: | --- |
| 1 | LADWP Secondary Market Snapshot |
| 2 | Methodology Lock |
| 3 | Core Signals |
| 4 | Reference Lines |
| 5 | Peer Relative Value |
| 6 | Top CUSIP Opportunities |
| 7 | Recommendation |
| 8 | Next Steps |

## Locked Methodology Notes

1. AAA MMD is the primary benchmark. Uploaded `mmd.csv` is treated as the AAA curve. Trade Sheet Index / Index Rate is fallback only.
2. Spread is issuer yield minus the active benchmark yield, shown in basis points.
3. Rating assumptions are explanatory and attribution-only. They are not embedded into the benchmark spread.
4. Sector and maturity are fallback peer grouping keys when rating or issuer peer coverage is incomplete.
5. Liquidity is scored separately from spread, using trade count, total par, and recency.
6. Callable and structure effects should be displayed separately in attribution when source fields exist.
7. Screener spread and CUSIP detail spread are different surfaces. Screener spread is the scored candidate aggregate. Detail spread is the selected security detail/latest path view.
8. Peer RV is null in this single-issuer LADWP sample because no other issuer peer universe is uploaded.
9. Recommendation remains rule-based and explainable. No OpenAI commentary is used for this validation baseline.

## Analyst Signoff Checklist

| Item | Status | Notes |
| --- | --- | --- |
| LADWP.xlsx accepted as canonical sample | Pending analyst signoff | This report assumes it is the trusted file. |
| Raw rows vs model-ready rows accepted | Pending analyst signoff | 47,057 raw/source rows to 41,269 model-ready rows. |
| AAA MMD benchmark accepted | Pending analyst signoff | 17,940 active uploaded MMD points, fallback used 0. |
| Spread/liquidity/top CUSIP accepted | Pending analyst signoff | 57.98 bps, liquidity 100, top CUSIP 544532NV2. |
| PDF/PPTX output accepted | Pending analyst signoff | Export package is structurally valid, content review still needed. |

## Validation-Gated Streamlit Parity Plan

After analyst signoff, use this LADWP baseline as the gate for UI and Streamlit parity changes:

1. Any chart, screener, drilldown, export, or recommendation change must keep `npm run validate:ladwp` passing unless the methodology change is intentionally approved.
2. If the methodology changes, refresh this report and `ladwp_expected.json` with `npm run validate:ladwp -- --update`.
3. Next parity work should prioritize layout clarity, chart drilldown, and report polish only after the LADWP core numbers are accepted.
