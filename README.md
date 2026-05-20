# Municipal Secondary Market Dashboard Generator

This is a self-service Streamlit app. Users bring their own MuniPro / trade-history exports and bond master data, upload them in the app, and receive issuer-level relative value and liquidity analytics.

## What users upload

Required:
- Bond master file: CSV or Excel
- One or more trade-history files: CSV or Excel

Optional:
- Issuer / sector mapping file
- MMD curve file

## Run locally

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Privacy / data note

Do not commit real MuniPro or proprietary trade exports to public GitHub. This app is designed for users to upload their own authorized files during their own session.
