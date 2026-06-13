# LADWP Validation Fixture

This fixture locks a reproducible LADWP baseline for methodology and regression checks.

## Inputs

- Trade file: `LADWP.csv` or `LADWP.xlsx` from the local LADWP sample folder.
- Benchmark file: `mmd.csv` from the same sample folder.
- Important format note: the local `LADWP.csv` file is actually an XLSX/ZIP workbook with a `.csv` extension. The validation script detects the file content and reads it as XLSX.

Set custom paths when the local sample folder is not available:

```bash
NEXTSR_LADWP_TRADE_FILE="/path/to/LADWP.xlsx" \
NEXTSR_LADWP_MMD_FILE="/path/to/mmd.csv" \
npm run validate:ladwp
```

## Command

```bash
npm run validate:ladwp
```

To intentionally refresh the expected snapshot after an approved methodology change:

```bash
npm run validate:ladwp -- --update
```

## Current Locked Outputs

- Issuer: `LADWP`
- Maturity bucket: `12Y`
- As of date: `2026-05-22`
- Benchmark source: `Uploaded AAA MMD`
- Current spread: `57.98 bps`
- Liquidity score: `100`
- Top CUSIP: `544532NV2`
- Top CUSIP signal: `Wide + Liquid`
- PDF export header: `%PDF-1.4`
- PPTX export header: `PK`
- PPTX package check: includes slide 8 and theme XML.

## Review Notes

- Screener spread and CUSIP detail spread intentionally use different surfaces: screener is the scored candidate aggregate; drilldown detail is the selected security detail/latest path view.
- Peer median and peer gap are currently `null` for this single-issuer LADWP-only sample because no other issuer peer universe is uploaded.
- This snapshot is an engine regression baseline. Final business validation still needs analyst signoff against an independently reviewed expected-output file.
