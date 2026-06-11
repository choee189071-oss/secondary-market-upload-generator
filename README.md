# Municipal Secondary Market Dashboard Generator

This is a self-service Streamlit app. Users bring their own MuniPro / trade-history exports and bond master data, upload them in the app, and receive issuer-level relative value and liquidity analytics.

## What users upload

Required:
- Bond master file: CSV or Excel
- One or more trade-history files: CSV or Excel

Optional:
- Issuer / sector mapping file
- AAA MMD curve file

## Run locally

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Build nextsr payload

Generate a stable JSON payload from a MuniPro trade file without opening the
Streamlit dashboard:

```bash
python scripts/build_nextsr_payload.py data/processed/Trade_Output_Sample.csv \
  --output nextsr_payload.json
```

The payload contract is versioned as `nextsr_payload.v1` and includes issuer,
maturity bucket, benchmark source, spread signals, liquidity signals, flow
signals, a rule label, and evidence bullets.

## Next.js / Vercel app

The `nextsr-web/` directory contains the first Vercel-oriented interface. It
uses Next.js App Router, exposes `POST /api/nextsr-payload`, and generates the
same `nextsr_payload.v1` contract from CSV/XLSX/XLS uploads.

```bash
cd nextsr-web
npm install
npm run dev
```

## Privacy / data note

Do not commit real MuniPro or proprietary trade exports to public GitHub. This app is designed for users to upload their own authorized files during their own session.
