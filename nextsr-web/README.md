# NextSR Upload Generator

Next.js/Vercel app for generating `nextsr_payload.v1` JSON from municipal
secondary-market trade CSV files.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy

Import this `nextsr-web` directory as a Vercel project. If importing from the
repository root, set **Root Directory** to:

```text
nextsr-web
```

The app uses the Next.js App Router and exposes `POST /api/nextsr-payload`.
`vercel.json` pins the standard install/build settings.

## Current Input Support

- CSV trade files from MuniPro-style exports
- Excel `.xlsx` / `.xls` trade files
- Filename-based issuer inference
- Uploaded AAA MMD benchmark curve as the primary spread benchmark
- Trade-sheet benchmark source via `Bnch Year` / `Bnch Rate` as fallback
- Readiness panel for detected fields, missing required fields, and missing recommended fields

## Deployment Checklist

1. Push the repository to GitHub.
2. Create a new Vercel project from the GitHub repository.
3. Set Root Directory to `nextsr-web`.
4. Keep the default framework as Next.js.
5. Deploy, then test with `data/processed/Trade_Output_Sample.csv`.
