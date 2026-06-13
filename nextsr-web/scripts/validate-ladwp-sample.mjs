import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const nodeRequire = createRequire(import.meta.url);
const defaultExpectedPath = path.join(appRoot, "fixtures", "validation", "ladwp_expected.json");
const defaultReportPath = path.join(appRoot, "fixtures", "validation", "ladwp_validation_report.md");
const localLadwpDir = "/Users/zhouyiyi/Desktop/Intern_Muni_Data/Secondary/LADWP/2024-26";
const defaultTradePath =
  process.env.NEXTSR_LADWP_TRADE_FILE ??
  (fsSync.existsSync(path.join(localLadwpDir, "LADWP.xlsx"))
    ? path.join(localLadwpDir, "LADWP.xlsx")
    : fsSync.existsSync(path.join(localLadwpDir, "LADWP.csv"))
      ? path.join(localLadwpDir, "LADWP.csv")
      : "");
const defaultMmdPath =
  process.env.NEXTSR_LADWP_MMD_FILE ??
  (fsSync.existsSync(path.join(localLadwpDir, "mmd.csv")) ? path.join(localLadwpDir, "mmd.csv") : "");

const args = parseArgs(process.argv.slice(2));
const tradePathInput = args.trade ?? defaultTradePath;
const mmdPathInput = args.mmd ?? defaultMmdPath;
if (!tradePathInput || !mmdPathInput) {
  throw new Error("Missing LADWP inputs. Pass --trade and --mmd, or set NEXTSR_LADWP_TRADE_FILE and NEXTSR_LADWP_MMD_FILE.");
}
const tradePath = path.resolve(tradePathInput);
const mmdPath = path.resolve(mmdPathInput);
const expectedPath = path.resolve(args.expected ?? defaultExpectedPath);
const outPath = args.out ? path.resolve(args.out) : null;
const reportPath = path.resolve(args.report ?? defaultReportPath);
const updateExpected = Boolean(args.update);

const { buildNextsrPayloadFromFiles } = loadTsModule(path.join(appRoot, "src", "lib", "nextsrPayload.ts"));
const { buildPdfReportBlob, buildPptxReportBlob, buildReportSlides } = loadTsModule(
  path.join(appRoot, "src", "lib", "clientExports.ts")
);

const tradeRead = await readTabularFile(tradePath);
const mmdRead = await readTabularFile(mmdPath);
const result = buildNextsrPayloadFromFiles({
  tradeFiles: [{ sourceFile: path.basename(tradePath), rows: tradeRead.rows }],
  mmdRows: mmdRead.rows,
  periodDays: Number(args.periodDays ?? 30)
});

const slides = buildReportSlides(result.payload, result.dashboard, result.security_screener);
const pdfBlob = buildPdfReportBlob(result.payload, result.dashboard, result.security_screener);
const pptxBlob = buildPptxReportBlob(result.payload, result.dashboard, result.security_screener);
const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
const pptxBuffer = Buffer.from(await pptxBlob.arrayBuffer());
const actual = buildValidationSnapshot({
  result,
  tradeRead,
  mmdRead,
  slides,
  pdfBuffer,
  pptxBuffer
});

if (outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(actual, null, 2)}\n`);
}

if (updateExpected) {
  await fs.mkdir(path.dirname(expectedPath), { recursive: true });
  await fs.writeFile(expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
  await fs.writeFile(reportPath, buildMarkdownReport(actual, { tradePath, mmdPath }));
  console.log(`Updated expected snapshot: ${expectedPath}`);
  console.log(`Updated validation report: ${reportPath}`);
  process.exit(0);
}

const expected = JSON.parse(await fs.readFile(expectedPath, "utf8"));
const differences = compareSnapshots(expected, actual);
if (differences.length) {
  console.error(`LADWP validation failed with ${differences.length} difference(s):`);
  for (const diff of differences.slice(0, 40)) {
    console.error(`- ${diff}`);
  }
  if (differences.length > 40) {
    console.error(`- ... ${differences.length - 40} more`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "pass",
      issuer: actual.payload.issuer,
      maturity_bucket: actual.payload.maturity_bucket,
      as_of_date: actual.payload.as_of_date,
      current_spread_bps: actual.payload.current_spread_bps,
      liquidity_score: actual.payload.liquidity_score,
      top_cusip: actual.top_candidate.cusip,
      pdf_bytes: actual.report_exports.pdf_bytes,
      pptx_bytes: actual.report_exports.pptx_bytes
    },
    null,
    2
  )
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    if (key === "update") {
      parsed.update = true;
      continue;
    }
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function loadTsModule(filePath) {
  const source = fsSync.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const cjsModule = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier.startsWith("./")) {
      return loadTsModule(path.resolve(path.dirname(filePath), specifier));
    }
    return nodeRequire(specifier);
  };
  new Function("require", "module", "exports", "__dirname", "__filename", output)(
    localRequire,
    cjsModule,
    cjsModule.exports,
    path.dirname(filePath),
    filePath
  );
  return cjsModule.exports;
}

async function readTabularFile(filePath) {
  const buffer = await fs.readFile(filePath);
  const lowerName = path.basename(filePath).toLowerCase();
  const detectedFormat = detectTabularFormat(buffer, lowerName);
  if (detectedFormat === "xlsx" || detectedFormat === "xls") {
    return {
      detected_format: detectedFormat,
      rows: workbookRows(buffer)
    };
  }
  if (detectedFormat === "csv") {
    return {
      detected_format: "csv",
      rows: csvRows(buffer.toString("utf8"))
    };
  }
  throw new Error(`Unsupported LADWP validation file: ${filePath}`);
}

function detectTabularFormat(buffer, lowerName) {
  const isZipWorkbook = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (isZipWorkbook) return "xlsx";
  if (lowerName.endsWith(".xlsx")) return "xlsx";
  if (lowerName.endsWith(".xls")) return "xls";
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) return "csv";
  return "unknown";
}

function workbookRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === "ag-grid") ?? workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  return sheetRows(workbook.Sheets[sheetName]);
}

function csvRows(text) {
  const workbook = XLSX.read(text, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  return sheetRows(workbook.Sheets[sheetName]);
}

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [cleanColumnName(key), value == null ? "" : String(value)]))
  );
}

function cleanColumnName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildValidationSnapshot({ result, tradeRead, mmdRead, slides, pdfBuffer, pptxBuffer }) {
  const { payload, dashboard, security_screener: candidates } = result;
  const topCandidate = candidates[0] ?? null;
  const selectedDetail = topCandidate
    ? dashboard.security_details.find((detail) => detail.cusip === topCandidate.cusip) ?? null
    : null;
  const currentPeer = dashboard.peer_rv.find((row) => row.maturity_bucket === payload.maturity_bucket) ?? null;
  return {
    schema_version: "nextsr_ladwp_validation.v1",
    inputs: {
      trade_detected_format: tradeRead.detected_format,
      mmd_detected_format: mmdRead.detected_format,
      trade_source_rows: tradeRead.rows.length,
      mmd_source_rows: mmdRead.rows.length
    },
    payload: {
      issuer: payload.issuer,
      maturity_bucket: payload.maturity_bucket,
      as_of_date: payload.as_of_date,
      label: payload.label,
      trade_rows: payload.universe.trade_rows,
      cusip_count: payload.universe.cusip_count,
      benchmark_source: payload.universe.benchmark_source,
      current_spread_bps: round(payload.signals.spread.current_spread_bps),
      spread_change_bps: round(payload.signals.spread.spread_change_bps),
      historical_percentile_1y: round(payload.signals.spread.historical_percentile_1y),
      liquidity_score: round(payload.signals.liquidity.liquidity_score),
      liquidity_trade_count: payload.signals.liquidity.trade_count,
      liquidity_total_trade_amount: payload.signals.liquidity.total_trade_amount,
      flow_imbalance: round(payload.signals.flow.sell_buy_imbalance)
    },
    benchmark_governance: {
      active_source: dashboard.benchmark_governance.active_source,
      uploaded_mmd_points: dashboard.benchmark_governance.uploaded_mmd_points,
      trade_index_points: dashboard.benchmark_governance.trade_index_points,
      fallback_points_used: dashboard.benchmark_governance.fallback_points_used,
      missing_active_tenors: dashboard.benchmark_governance.missing_active_tenors
    },
    top_candidate: topCandidate
      ? {
          cusip: topCandidate.cusip,
          signal: topCandidate.signal,
          maturity_bucket: topCandidate.maturity_bucket,
          latest_trade_date: topCandidate.latest_trade_date,
          spread_to_benchmark_bps: round(topCandidate.spread_to_benchmark_bps),
          liquidity_score: round(topCandidate.liquidity_score),
          rv_score: round(topCandidate.rv_score),
          trade_count: topCandidate.trade_count,
          total_trade_amount: topCandidate.total_trade_amount
        }
      : null,
    top_candidate_detail: selectedDetail
      ? {
          cusip: selectedDetail.cusip,
          trade_count: selectedDetail.trade_count,
          total_trade_amount: selectedDetail.total_trade_amount,
          latest_yield: round(selectedDetail.latest_yield),
          latest_price: round(selectedDetail.latest_price),
          spread_to_benchmark_bps: round(selectedDetail.spread_to_benchmark_bps),
          trades_returned: selectedDetail.trades.length
        }
      : null,
    top_5_candidates: candidates.slice(0, 5).map((candidate) => ({
      cusip: candidate.cusip,
      signal: candidate.signal,
      maturity_bucket: candidate.maturity_bucket,
      spread_to_benchmark_bps: round(candidate.spread_to_benchmark_bps),
      liquidity_score: round(candidate.liquidity_score),
      rv_score: round(candidate.rv_score),
      trade_count: candidate.trade_count,
      total_trade_amount: candidate.total_trade_amount
    })),
    peer_rv_current_bucket: currentPeer
      ? {
          maturity_bucket: currentPeer.maturity_bucket,
          issuer_spread_bps: round(currentPeer.issuer_spread_bps),
          peer_median_spread_bps: round(currentPeer.peer_median_spread_bps),
          peer_gap_bps: round(currentPeer.peer_gap_bps),
          issuer_trade_count: currentPeer.issuer_trade_count,
          peer_issuer_count: currentPeer.peer_issuer_count
        }
      : null,
    cross_issuer_rv: dashboard.cross_issuer_rv.slice(0, 3).map((row) => ({
      issuer: row.issuer,
      sector: row.sector,
      avg_spread_bps: round(row.avg_spread_bps),
      liquidity_score: round(row.liquidity_score),
      trade_count: row.trade_count,
      cusip_count: row.cusip_count,
      rv_score: round(row.rv_score),
      latest_trade_date: row.latest_trade_date
    })),
    report_exports: {
      slide_count: slides.length,
      slide_titles: slides.map((slide) => slide.title),
      pdf_header: pdfBuffer.subarray(0, 8).toString("ascii"),
      pdf_bytes: pdfBuffer.length,
      pptx_header: pptxBuffer.subarray(0, 4).toString("ascii"),
      pptx_bytes: pptxBuffer.length,
      pptx_contains_slide8: pptxBuffer.includes(Buffer.from("ppt/slides/slide8.xml")),
      pptx_contains_theme: pptxBuffer.includes(Buffer.from("ppt/theme/theme1.xml"))
    }
  };
}

function buildMarkdownReport(snapshot, sources) {
  const candidateRows = snapshot.top_5_candidates
    .map(
      (row, index) =>
        `| ${index + 1} | ${row.cusip} | ${row.signal} | ${row.maturity_bucket ?? "N/A"} | ${formatBps(row.spread_to_benchmark_bps)} | ${formatNumber(row.liquidity_score)} | ${formatNumber(row.rv_score)} | ${row.trade_count.toLocaleString()} | ${formatMoney(row.total_trade_amount)} |`
    )
    .join("\n");
  const crossIssuerRows = snapshot.cross_issuer_rv.length
    ? snapshot.cross_issuer_rv
        .map(
          (row) =>
            `| ${row.issuer} | ${row.sector ?? "N/A"} | ${formatBps(row.avg_spread_bps)} | ${formatNumber(row.liquidity_score)} | ${row.trade_count.toLocaleString()} | ${row.cusip_count.toLocaleString()} | ${formatNumber(row.rv_score)} | ${row.latest_trade_date ?? "N/A"} |`
        )
        .join("\n")
    : "| N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |";
  const slideRows = snapshot.report_exports.slide_titles.map((title, index) => `| ${index + 1} | ${title} |`).join("\n");

  return `# LADWP Golden Sample Validation Report

## Status

This report makes \`LADWP.xlsx + mmd.csv\` the human-readable golden sample baseline for NextSR validation. The JSON fixture remains the machine-readable regression snapshot.

## Source Files

| Item | Value |
| --- | --- |
| Canonical trade file | \`LADWP.xlsx\` |
| Trade file used in this run | \`${path.basename(sources.tradePath)}\` |
| MMD file used in this run | \`${path.basename(sources.mmdPath)}\` |
| Trade detected format | \`${snapshot.inputs.trade_detected_format}\` |
| MMD detected format | \`${snapshot.inputs.mmd_detected_format}\` |
| Trade source rows | ${snapshot.inputs.trade_source_rows.toLocaleString()} |
| MMD source rows | ${snapshot.inputs.mmd_source_rows.toLocaleString()} |

## Data Reconciliation

| Metric | Value |
| --- | ---: |
| Raw/source trade rows | ${snapshot.inputs.trade_source_rows.toLocaleString()} |
| Model-ready trade rows | ${snapshot.payload.trade_rows.toLocaleString()} |
| Rows excluded before model-ready universe | ${(snapshot.inputs.trade_source_rows - snapshot.payload.trade_rows).toLocaleString()} |
| CUSIP count | ${snapshot.payload.cusip_count.toLocaleString()} |
| Benchmark source | ${snapshot.payload.benchmark_source} |
| Uploaded AAA MMD points | ${snapshot.benchmark_governance.uploaded_mmd_points.toLocaleString()} |
| Trade index fallback points | ${snapshot.benchmark_governance.trade_index_points.toLocaleString()} |
| Fallback points used | ${snapshot.benchmark_governance.fallback_points_used.toLocaleString()} |

## Core Output Snapshot

| Metric | Value |
| --- | --- |
| Issuer | ${snapshot.payload.issuer} |
| Maturity bucket | ${snapshot.payload.maturity_bucket} |
| As of date | ${snapshot.payload.as_of_date} |
| Label | ${snapshot.payload.label} |
| Current spread | ${formatBps(snapshot.payload.current_spread_bps)} |
| Spread change | ${formatBps(snapshot.payload.spread_change_bps)} |
| Historical percentile | ${formatPercent(snapshot.payload.historical_percentile_1y)} |
| Liquidity score | ${formatNumber(snapshot.payload.liquidity_score)} |
| Liquidity trade count | ${snapshot.payload.liquidity_trade_count.toLocaleString()} |
| Liquidity par amount | ${formatMoney(snapshot.payload.liquidity_total_trade_amount)} |
| Flow imbalance | ${formatNumber(snapshot.payload.flow_imbalance)} |

## Top CUSIP Screener

| Rank | CUSIP | Signal | Bucket | Screener Spread | Liquidity | RV Score | Trades | Total Par |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
${candidateRows}

## Selected Top CUSIP Detail

| Metric | Value |
| --- | --- |
| CUSIP | ${snapshot.top_candidate_detail?.cusip ?? "N/A"} |
| Detail trade count | ${snapshot.top_candidate_detail?.trade_count?.toLocaleString() ?? "N/A"} |
| Detail total par | ${snapshot.top_candidate_detail ? formatMoney(snapshot.top_candidate_detail.total_trade_amount) : "N/A"} |
| Latest yield | ${formatPercent(snapshot.top_candidate_detail?.latest_yield)} |
| Latest price | ${formatNumber(snapshot.top_candidate_detail?.latest_price)} |
| Detail spread | ${formatBps(snapshot.top_candidate_detail?.spread_to_benchmark_bps)} |
| Trade path points returned | ${snapshot.top_candidate_detail?.trades_returned?.toLocaleString() ?? "N/A"} |

## Peer RV And Cross-Issuer RV

| Metric | Value |
| --- | --- |
| Current peer bucket | ${snapshot.peer_rv_current_bucket?.maturity_bucket ?? "N/A"} |
| Issuer spread in current bucket | ${formatBps(snapshot.peer_rv_current_bucket?.issuer_spread_bps)} |
| Peer median spread | ${formatBps(snapshot.peer_rv_current_bucket?.peer_median_spread_bps)} |
| Peer gap | ${formatBps(snapshot.peer_rv_current_bucket?.peer_gap_bps)} |
| Issuer trade count in bucket | ${snapshot.peer_rv_current_bucket?.issuer_trade_count?.toLocaleString() ?? "N/A"} |
| Peer issuer count | ${snapshot.peer_rv_current_bucket?.peer_issuer_count?.toLocaleString() ?? "N/A"} |

| Issuer | Sector | Avg Spread | Liquidity | Trades | CUSIPs | RV Score | Latest Trade |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${crossIssuerRows}

## Report Export Checks

| Check | Value |
| --- | --- |
| PDF header | \`${formatHeader(snapshot.report_exports.pdf_header)}\` |
| PDF bytes | ${snapshot.report_exports.pdf_bytes.toLocaleString()} |
| PPTX header | \`${formatHeader(snapshot.report_exports.pptx_header)}\` |
| PPTX bytes | ${snapshot.report_exports.pptx_bytes.toLocaleString()} |
| PPTX includes slide 8 | ${snapshot.report_exports.pptx_contains_slide8 ? "Yes" : "No"} |
| PPTX includes theme XML | ${snapshot.report_exports.pptx_contains_theme ? "Yes" : "No"} |
| Slide count | ${snapshot.report_exports.slide_count.toLocaleString()} |

| Slide | Title |
| ---: | --- |
${slideRows}

## Locked Methodology Notes

1. AAA MMD is the primary benchmark. Uploaded \`mmd.csv\` is treated as the AAA curve. Trade Sheet Index / Index Rate is fallback only.
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
| Raw rows vs model-ready rows accepted | Pending analyst signoff | ${snapshot.inputs.trade_source_rows.toLocaleString()} raw/source rows to ${snapshot.payload.trade_rows.toLocaleString()} model-ready rows. |
| AAA MMD benchmark accepted | Pending analyst signoff | ${snapshot.benchmark_governance.uploaded_mmd_points.toLocaleString()} active uploaded MMD points, fallback used ${snapshot.benchmark_governance.fallback_points_used.toLocaleString()}. |
| Spread/liquidity/top CUSIP accepted | Pending analyst signoff | ${formatBps(snapshot.payload.current_spread_bps)}, liquidity ${formatNumber(snapshot.payload.liquidity_score)}, top CUSIP ${snapshot.top_candidate?.cusip ?? "N/A"}. |
| PDF/PPTX output accepted | Pending analyst signoff | Export package is structurally valid, content review still needed. |

## Validation-Gated Streamlit Parity Plan

After analyst signoff, use this LADWP baseline as the gate for UI and Streamlit parity changes:

1. Any chart, screener, drilldown, export, or recommendation change must keep \`npm run validate:ladwp\` passing unless the methodology change is intentionally approved.
2. If the methodology changes, refresh this report and \`ladwp_expected.json\` with \`npm run validate:ladwp -- --update\`.
3. Next parity work should prioritize layout clarity, chart drilldown, and report polish only after the LADWP core numbers are accepted.
`;
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "N/A";
}

function formatBps(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${formatNumber(value)} bps` : "N/A";
}

function formatPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${formatNumber(value)}%` : "N/A";
}

function formatMoney(value) {
  return typeof value === "number" && Number.isFinite(value) ? `$${Math.round(value).toLocaleString()}` : "N/A";
}

function formatHeader(value) {
  return String(value)
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126 ? char : `\\x${code.toString(16).padStart(2, "0")}`;
    })
    .join("");
}

function round(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function compareSnapshots(expected, actual, basePath = "") {
  const diffs = [];
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [`${basePath}: expected ${typeof expected}, actual ${typeof actual}`];
    }
    if (expected.length !== actual.length) {
      diffs.push(`${basePath}: expected array length ${expected.length}, actual ${actual.length}`);
    }
    const length = Math.min(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      diffs.push(...compareSnapshots(expected[index], actual[index], `${basePath}[${index}]`));
    }
    return diffs;
  }
  if (isPlainObject(expected) || isPlainObject(actual)) {
    if (!isPlainObject(expected) || !isPlainObject(actual)) {
      return [`${basePath}: expected ${typeof expected}, actual ${typeof actual}`];
    }
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      diffs.push(...compareSnapshots(expected[key], actual[key], basePath ? `${basePath}.${key}` : key));
    }
    return diffs;
  }
  if (typeof expected === "number" || typeof actual === "number") {
    const exp = Number(expected);
    const act = Number(actual);
    if (!Number.isFinite(exp) || !Number.isFinite(act) || Math.abs(exp - act) > 0.01) {
      return [`${basePath}: expected ${expected}, actual ${actual}`];
    }
    return [];
  }
  if (expected !== actual) {
    return [`${basePath}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`];
  }
  return [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
