export type NextsrPayload = {
  schema_version: "nextsr_payload.v1";
  issuer: string | null;
  maturity_bucket: string | null;
  as_of_date: string | null;
  universe: {
    trade_rows: number;
    cusip_count: number;
    benchmark_source: string | null;
  };
  signals: {
    spread: {
      current_spread_bps: number | null;
      spread_change_bps: number | null;
      historical_percentile_1y: number | null;
      latest_spread_date: string | null;
    };
    liquidity: {
      liquidity_score: number | null;
      trade_count: number;
      total_trade_amount: number;
      days_since_last_trade: number | null;
    };
    flow: {
      sell_buy_imbalance: number | null;
      classified_buy_amount: number;
      classified_sell_amount: number;
    };
  };
  label: string;
  evidence: string[];
};

const MAX_TREND_POINTS = 240;
const MAX_SECURITY_DETAILS = 100;
const MAX_TRADE_PATH_POINTS = 45;
const MAX_BENCHMARK_AUDIT_ROWS = 120;
const MAX_EXPORT_SCREENER_ROWS = 60;

export type PayloadValidation = {
  source_file: string | null;
  raw_rows: number;
  model_ready_rows: number;
  detected_fields: Record<string, string | null>;
  missing_required: string[];
  missing_recommended: string[];
};

export type PayloadBuildResult = {
  payload: NextsrPayload;
  validation: PayloadValidation;
  security_screener: SecurityCandidate[];
  dashboard: DashboardAnalytics;
};

export type RawRow = Record<string, string>;

export type TradeFileInput = {
  rows: RawRow[];
  sourceFile: string | null;
};

export type FileReadinessReport = PayloadValidation & {
  dataset: string;
  can_run: boolean;
  warnings: string[];
};

export type DataHealth = {
  trade_files: number;
  trade_rows_raw: number;
  model_ready_rows: number;
  duplicate_rows_removed: number;
  issuers: number;
  cusips: number;
  first_trade_date: string | null;
  latest_trade_date: string | null;
  benchmark_source: string | null;
  reference_files: {
    bond_reference: boolean;
    issuer_mapping: boolean;
    uploaded_mmd: boolean;
  };
};

export type DataAuditStep = {
  step: string;
  status: "pass" | "review" | "blocked";
  rows_in: number;
  rows_out: number;
  rejected_rows: number;
  notes: string[];
};

export type FieldCoverageRow = {
  field: string;
  detected_column: string | null;
  non_null_rows: number;
  coverage_pct: number;
  required: boolean;
};

export type DataAuditCenter = {
  overall_status: "pass" | "review" | "blocked";
  steps: DataAuditStep[];
  field_coverage: FieldCoverageRow[];
  reconciliation: {
    raw_rows: number;
    model_ready_rows: number;
    duplicate_rows_removed: number;
    unmatched_benchmark_rows: number;
    benchmark_match_rate_pct: number;
    cusip_reference_match_rate_pct: number | null;
    issuer_mapping_match_rate_pct: number | null;
  };
  warnings: string[];
};

export type DataQualityScorecard = {
  overall_score: number | null;
  status: "pass" | "review" | "blocked";
  metrics: Array<{
    metric: string;
    score: number | null;
    status: "pass" | "review" | "blocked";
    numerator: number | null;
    denominator: number | null;
    detail: string;
  }>;
};

export type BenchmarkGovernance = {
  active_source: string | null;
  policy: string;
  trade_index_points: number;
  uploaded_mmd_points: number;
  active_points: number;
  fallback_points_used: number;
  missing_active_tenors: string[];
  rating_curve_selector: string;
  spread_assumptions: Array<{ rating: string; spread_bps: number; source: string }>;
  source_priority: Array<{ source: string; status: "active" | "fallback" | "missing"; points: number; notes: string }>;
};

export type IssuerOption = {
  issuer: string;
  sector: string;
  primary_type: string | null;
  trade_count: number;
  cusip_count: number;
  latest_trade_date: string | null;
};

export type SecurityCandidate = {
  cusip: string;
  issuer: string;
  sector?: string | null;
  maturity_bucket: string | null;
  latest_trade_date: string | null;
  trade_count: number;
  avg_yield: number | null;
  benchmark_yield: number | null;
  spread_to_benchmark_bps: number | null;
  liquidity_score: number | null;
  total_trade_amount: number;
  avg_trade_amount: number;
  avg_price: number | null;
  days_since_last_trade: number | null;
  rv_score: number | null;
  signal: string;
  evidence: string[];
};

export type CurvePoint = {
  maturity_bucket: string;
  maturity_year: number;
  issuer_yield: number | null;
  benchmark_yield: number | null;
  spread_bps: number | null;
  trade_count: number;
  total_trade_amount: number;
};

export type TrendPoint = {
  date: string;
  spread_bps: number;
  avg_yield: number;
  benchmark_yield: number;
  trade_count: number;
};

export type ActivityPoint = {
  month: string;
  trade_count: number;
  total_trade_amount: number;
};

export type PositionPoint = {
  cusip: string;
  issuer?: string;
  maturity_bucket: string | null;
  avg_yield: number | null;
  spread_bps: number | null;
  liquidity_score: number | null;
  rv_score: number | null;
  trade_count: number;
  total_trade_amount: number;
  signal: string;
};

export type SpreadMovementPoint = {
  maturity_bucket: string;
  latest_spread_bps: number | null;
  move_1w_bps: number | null;
  move_1m_bps: number | null;
  move_3m_bps: number | null;
  move_6m_bps: number | null;
  move_1y_bps: number | null;
};

export type LiquidityPoint = {
  maturity_bucket: string;
  trade_count: number;
  cusip_count: number;
  total_trade_amount: number;
  latest_trade_date: string | null;
  days_since_last_trade: number | null;
  liquidity_score: number | null;
};

export type DistributionPoint = {
  bucket: string;
  trade_count: number;
  cusip_count: number;
  total_trade_amount: number;
  share_pct: number;
};

export type TopCusipActivityPoint = {
  cusip: string;
  maturity_bucket: string | null;
  trade_count: number;
  total_trade_amount: number;
  days_since_last_trade: number | null;
  liquidity_score: number | null;
  spread_bps: number | null;
};

export type PeerRvPoint = {
  maturity_bucket: string;
  issuer_spread_bps: number | null;
  peer_median_spread_bps: number | null;
  peer_gap_bps: number | null;
  issuer_trade_count: number;
  peer_issuer_count: number;
};

export type CrossIssuerRvPoint = {
  issuer: string;
  sector: string | null;
  avg_spread_bps: number | null;
  liquidity_score: number | null;
  trade_count: number;
  cusip_count: number;
  rv_score: number | null;
  latest_trade_date: string | null;
};

export type SpreadAttributionPoint = {
  component: string;
  value_bps: number;
};

export type HistoricalSpreadPoint = {
  maturity_bucket: string;
  current_spread_bps: number | null;
  min_spread_bps: number | null;
  median_spread_bps: number | null;
  max_spread_bps: number | null;
  percentile: number | null;
  observations: number;
};

export type CurveShapeMetric = {
  metric: string;
  value: number | null;
  unit: "bps" | "%";
  readthrough: string;
};

export type ScenarioShockPoint = {
  maturity_bucket: string;
  maturity_year: number;
  shock_bps: number;
  duration_proxy: number;
  approx_price_impact_pct: number | null;
  trade_count: number;
  total_trade_amount: number;
};

export type DealerProxyPoint = {
  side: "Buy" | "Sell" | "Other";
  trade_count: number;
  total_trade_amount: number;
};

export type SecurityTradePoint = {
  date: string | null;
  yield: number | null;
  price: number | null;
  trade_amount: number;
  spread_bps: number | null;
  benchmark_yield: number | null;
  trade_type: string | null;
};

export type SecurityDetail = {
  cusip: string;
  issuer: string;
  sector: string | null;
  description: string | null;
  maturity_bucket: string | null;
  maturity_date: string | null;
  coupon: number | null;
  latest_trade_date: string | null;
  trade_count: number;
  total_trade_amount: number;
  avg_yield: number | null;
  latest_yield: number | null;
  avg_price: number | null;
  latest_price: number | null;
  spread_to_benchmark_bps: number | null;
  liquidity_score: number | null;
  rv_score: number | null;
  signal: string;
  readthrough: string[];
  evidence: string[];
  trades: SecurityTradePoint[];
};

export type BenchmarkAuditRow = {
  date: string;
  tenor: string;
  benchmark_yield: number;
  benchmark_source: string;
  observation_count: number;
};

export type RecommendationNarrative = {
  label: string;
  summary: string;
  drivers: string[];
  caveats: string[];
  evidence: string[];
};

export type DeskSnapshot = {
  thesis: string;
  market_read: string;
  action_bias: string;
  confidence: "High" | "Medium" | "Low";
  key_metrics: Array<{ label: string; value: string; tone: "positive" | "warning" | "negative" | "neutral"; detail: string }>;
  decision_points: string[];
  next_steps: string[];
  risk_flags: string[];
};

export type ChartReferenceLine = {
  id: string;
  label: string;
  value_bps: number;
  source: string;
  description: string;
  tone: "current" | "sector" | "market" | "baseline" | "peer";
};

export type CommentaryStudio = {
  market_context: Array<{ step: string; status: "ready" | "review" | "missing"; evidence: string }>;
  analyst_review: Array<{ check: string; status: "pass" | "review" | "blocked"; notes: string }>;
  generated_commentary: {
    headline: string;
    bullets: string[];
    client_note: string;
    internal_note: string;
  };
};

export type StreamlitParityAuditItem = {
  area: string;
  streamlit_surface: string;
  source_anchor: string;
  next_surface: string;
  status: "ported" | "partial" | "missing" | "next-enhanced";
  priority: "High" | "Medium" | "Low";
  notes: string;
  next_step: string;
};

export type MethodologySection = {
  title: string;
  body: string;
};

export type ReportArtifacts = {
  html_report: string;
  chart_data_json: string;
  audit_data_json: string;
  security_detail_csv: string;
  benchmark_csv: string;
  ppt_outline_markdown: string;
  report_manifest_json: string;
};

export type DashboardAnalytics = {
  file_readiness: FileReadinessReport[];
  data_health: DataHealth;
  data_audit_center: DataAuditCenter;
  data_quality_scorecard: DataQualityScorecard;
  benchmark_governance: BenchmarkGovernance;
  issuers: IssuerOption[];
  issuer_curve: CurvePoint[];
  spread_trend: TrendPoint[];
  linked_spread_trends: Record<string, TrendPoint[]>;
  monthly_activity: ActivityPoint[];
  positioning: PositionPoint[];
  spread_movement_ladder: SpreadMovementPoint[];
  liquidity: LiquidityPoint[];
  trade_size_distribution: DistributionPoint[];
  staleness_distribution: DistributionPoint[];
  top_cusip_activity: TopCusipActivityPoint[];
  peer_rv: PeerRvPoint[];
  cross_issuer_rv: CrossIssuerRvPoint[];
  spread_attribution: SpreadAttributionPoint[];
  historical_percentiles: HistoricalSpreadPoint[];
  curve_shape: CurveShapeMetric[];
  scenario_shock: ScenarioShockPoint[];
  dealer_proxy: DealerProxyPoint[];
  security_details: SecurityDetail[];
  benchmark_audit: BenchmarkAuditRow[];
  recommendation: RecommendationNarrative;
  desk_snapshot: DeskSnapshot;
  chart_reference_lines: ChartReferenceLine[];
  commentary_studio: CommentaryStudio;
  streamlit_parity_audit: StreamlitParityAuditItem[];
  methodology_sections: MethodologySection[];
  report_artifacts: ReportArtifacts;
  analyst_context: Record<string, unknown>;
  export_summary_markdown: string;
  admin: {
    methodology_version: string;
    benchmark_policy: string;
    module_status: Array<{ module: string; status: "ported" | "partial" | "placeholder"; notes: string }>;
  };
};

type TradeRow = {
  trade_datetime: Date | null;
  cusip: string | null;
  description: string | null;
  maturity: Date | null;
  trade_date: Date | null;
  coupon: number | null;
  yield: number | null;
  price: number | null;
  trade_amount: number | null;
  index: string | null;
  index_rate: number | null;
  spread: number | null;
  trade_type: string | null;
  ratings_m_s_f: string | null;
  source_file: string | null;
  issuer: string;
  sector: string;
  primary_type: string | null;
  maturity_bucket: string | null;
};

type BenchmarkRow = {
  date: string;
  tenor: string;
  benchmark_yield: number;
  benchmark_source: string;
  observation_count?: number;
};

type SpreadObservation = {
  issuer: string;
  trade_date: string;
  maturity_bucket: string;
  avg_yield: number;
  trade_count: number;
  total_trade_amount: number;
  tenor: string;
  benchmark_yield: number;
  spread_to_benchmark_bps: number;
};

type BondReferenceValue = {
  issuer: string | null;
  sector: string | null;
  primary_type: string | null;
  description: string | null;
  maturity: Date | null;
  coupon: number | null;
};

const MAX_MATURITY_YEAR = 40;
const MATURITY_BUCKET_ORDER = Array.from({ length: MAX_MATURITY_YEAR }, (_, index) => `${index + 1}Y`);

function cleanColumnName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseCsv(text: string): RawRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  const [headers = [], ...body] = rows;
  const cleanedHeaders = headers.map(cleanColumnName);
  return body.map((values) => {
    const record: RawRow = {};
    cleanedHeaders.forEach((header, index) => {
      record[header] = (values[index] ?? "").trim();
    });
    return record;
  });
}

function textValue(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text || ["nan", "none", "null", "<na>"].includes(text.toLowerCase())) {
    return null;
  }
  return text;
}

function numericValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).replace(/\$/g, "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: string | null | undefined): Date | null {
  const text = textValue(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function inferIssuerFromFileName(fileName: string | null): string {
  if (!fileName) {
    return "Unknown";
  }
  const stem = fileName.replace(/\.[^.]+$/, "");
  const cleaned = stem
    .replace(/([_\-\s]+)?(trade|trades|trade[_\-\s]*history|munipro|export|secondary|market|history|data)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "Unknown";
  }
  if (cleaned.length <= 8 && cleaned.replace(/\s/g, "") === cleaned.replace(/\s/g, "").toUpperCase()) {
    return cleaned;
  }
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\bCa\b/g, "CA").replace(/\bUsd\b/g, "USD");
}

function first(row: RawRow, aliases: string[]): string | null {
  for (const alias of aliases) {
    const key = cleanColumnName(alias);
    const value = textValue(row[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function detectedField(rows: RawRow[], aliases: string[]): string | null {
  const keys = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }
  for (const alias of aliases) {
    const key = cleanColumnName(alias);
    if (keys.has(key)) {
      return key;
    }
  }
  return null;
}

function buildValidation(rows: RawRow[], trades: TradeRow[], sourceFile: string | null): PayloadValidation {
  const fieldAliases: Record<string, string[]> = {
    cusip: ["cusip", "cusip9", "security_id"],
    trade_date: ["trade_date", "trade date", "date", "transaction_date", "td_time", "td & time"],
    yield: ["ytw", "ytm", "msrb_yld", "yield", "yield_to_worst", "yield to worst"],
    maturity: ["mty", "maturity", "maturity_date", "maturity date"],
    trade_amount: ["qty_m", "qty (m)", "trade_amount", "trade amount", "par_amount", "quantity", "amount"],
    index: ["bnch_year", "bnch year", "benchmark_year", "index", "benchmark"],
    index_rate: ["bnch_rate", "bnch rate", "index_rate", "benchmark_rate"],
    spread: ["spread_bp", "spread bp", "spread_bps", "spread"],
    trade_type: ["tde_type", "tde type", "trade_type", "side", "buy_sell"],
    price: ["price", "trade_price", "execution_price"],
    ratings: ["m", "s", "f", "ratings_m_s_f", "ratings m/s/f", "ratings", "rating"]
  };
  const detectedFields = Object.fromEntries(
    Object.entries(fieldAliases).map(([field, aliases]) => [field, detectedField(rows, aliases)])
  );
  const required = ["cusip", "trade_date", "yield"];
  const recommended = ["maturity", "trade_amount", "index_rate", "spread", "trade_type", "price", "ratings"];
  return {
    source_file: sourceFile,
    raw_rows: rows.length,
    model_ready_rows: trades.length,
    detected_fields: detectedFields,
    missing_required: required.filter((field) => detectedFields[field] === null),
    missing_recommended: recommended.filter((field) => detectedFields[field] === null)
  };
}

function buildReadinessReport(rows: RawRow[], trades: TradeRow[], sourceFile: string | null, dataset: string): FileReadinessReport {
  const validation = buildValidation(rows, trades, sourceFile);
  const warnings: string[] = [];
  if (validation.raw_rows > 0 && validation.model_ready_rows === 0) {
    warnings.push("No model-ready rows were produced from this file.");
  }
  if (validation.missing_required.length) {
    warnings.push(`Missing required fields: ${validation.missing_required.join(", ")}.`);
  }
  if (validation.missing_recommended.length) {
    warnings.push(`Missing recommended fields: ${validation.missing_recommended.join(", ")}.`);
  }
  return {
    ...validation,
    dataset,
    can_run: validation.missing_required.length === 0 && validation.model_ready_rows > 0,
    warnings
  };
}

function maturityBucket(maturity: Date | null, tradeDate: Date | null): string | null {
  if (!maturity || !tradeDate) {
    return null;
  }
  const years = (maturity.getTime() - tradeDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(years)) {
    return null;
  }
  const year = Math.ceil(years);
  if (year < 1 || year > MAX_MATURITY_YEAR) {
    return null;
  }
  return `${year}Y`;
}

function standardizeRows(rows: RawRow[], sourceFile: string | null): TradeRow[] {
  return rows
    .map((row) => {
      const tradeDate = dateValue(first(row, ["trade_date", "trade date", "date", "transaction_date"]));
      const tradeDateTime = dateValue(first(row, ["td_time", "td & time", "trade_date_time", "trade date/time", "trade_datetime"]));
      const maturity = dateValue(first(row, ["mty", "maturity", "maturity_date", "maturity date"]));
      const qtyM = numericValue(first(row, ["qty_m", "qty (m)"]));
      const tradeAmountRaw = numericValue(first(row, ["trade_amount", "trade amount", "par_amount", "par traded", "quantity", "amount"]));
      const tradeAmount = qtyM !== null && tradeAmountRaw === null ? qtyM * 1000 : tradeAmountRaw;
      const ratings = [first(row, ["m"]), first(row, ["s"]), first(row, ["f"])].filter(Boolean).join("/");

      return {
        trade_datetime: tradeDateTime,
        cusip: first(row, ["cusip", "cusip9", "security_id"]),
        description: first(row, ["description", "security_description", "security description", "bond_description"]),
        maturity,
        trade_date: tradeDate ?? tradeDateTime,
        coupon: numericValue(first(row, ["cpn", "coupon", "coupon_rate"])),
        yield: numericValue(first(row, ["ytw", "ytm", "msrb_yld", "yield", "yield_to_worst", "yield to worst"])),
        price: numericValue(first(row, ["price", "trade_price", "execution_price"])),
        trade_amount: tradeAmount,
        index: first(row, ["bnch_year", "bnch year", "benchmark_year", "index", "benchmark"]),
        index_rate: numericValue(first(row, ["bnch_rate", "bnch rate", "index_rate", "benchmark_rate"])),
        spread: numericValue(first(row, ["spread_bp", "spread bp", "spread_bps", "spread"])),
        trade_type: first(row, ["tde_type", "tde type", "trade_type", "side", "buy_sell"]),
        ratings_m_s_f: ratings || first(row, ["ratings_m_s_f", "ratings m/s/f", "ratings", "rating"]),
        source_file: sourceFile,
        issuer: inferIssuerFromFileName(sourceFile),
        sector: "Unknown",
        primary_type: null,
        maturity_bucket: null
      };
    })
    .filter((row) => row.cusip && row.trade_date)
    .map((row) => ({
      ...row,
      maturity_bucket: maturityBucket(row.maturity, row.trade_date)
    }));
}

function dedupeTrades(trades: TradeRow[]): { trades: TradeRow[]; removed: number } {
  const seen = new Set<string>();
  const deduped: TradeRow[] = [];
  for (const trade of trades) {
    const key = [
      trade.source_file,
      trade.cusip,
      trade.trade_date ? dateKey(trade.trade_date) : "",
      trade.trade_amount ?? "",
      trade.yield ?? "",
      trade.price ?? "",
      trade.trade_type ?? ""
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(trade);
  }
  return { trades: deduped, removed: trades.length - deduped.length };
}

function standardizeIssuerMapping(rows: RawRow[]): Map<string, { sector: string; primary_type: string | null }> {
  const mapping = new Map<string, { sector: string; primary_type: string | null }>();
  for (const row of rows) {
    const issuer = first(row, ["issuer", "issuer_name", "name"]);
    if (!issuer) {
      continue;
    }
    mapping.set(issuer, {
      sector: first(row, ["sector", "industry", "sector_name"]) ?? "Unknown",
      primary_type: first(row, ["primary_type", "primary type", "type", "bond_type"])
    });
  }
  return mapping;
}

function standardizeBondReference(rows: RawRow[]) {
  const mapping = new Map<string, BondReferenceValue>();
  for (const row of rows) {
    const cusip = first(row, ["cusip", "cusip9", "security_id"]);
    if (!cusip) {
      continue;
    }
    mapping.set(cusip, {
      issuer: first(row, ["issuer", "issuer_name", "obligor"]),
      sector: first(row, ["sector", "industry", "sector_name"]),
      primary_type: first(row, ["primary_type", "primary type", "type", "bond_type"]),
      description: first(row, ["description", "security_description", "security description", "bond_description"]),
      maturity: dateValue(first(row, ["mty", "maturity", "maturity_date", "maturity date"])),
      coupon: numericValue(first(row, ["cpn", "coupon", "coupon_rate"]))
    });
  }
  return mapping;
}

function enrichTrades(
  trades: TradeRow[],
  bondReference: Map<string, BondReferenceValue>,
  issuerMapping: Map<string, { sector: string; primary_type: string | null }>
): TradeRow[] {
  return trades.map((trade) => {
    const bond = trade.cusip ? bondReference.get(trade.cusip) : undefined;
    const mapped = issuerMapping.get(trade.issuer);
    const issuerFromBond = bond?.issuer && trade.issuer === "Unknown" ? bond.issuer : trade.issuer;
    const issuer = issuerFromBond ?? trade.issuer;
    const issuerMapped = issuerMapping.get(issuer);
    return {
      ...trade,
      issuer,
      sector: issuerMapped?.sector ?? mapped?.sector ?? bond?.sector ?? trade.sector ?? "Unknown",
      primary_type: issuerMapped?.primary_type ?? mapped?.primary_type ?? bond?.primary_type ?? trade.primary_type ?? null,
      description: trade.description ?? bond?.description ?? null,
      maturity: trade.maturity ?? bond?.maturity ?? null,
      coupon: trade.coupon ?? bond?.coupon ?? null,
      maturity_bucket: trade.maturity_bucket ?? maturityBucket(bond?.maturity ?? null, trade.trade_date)
    };
  });
}

function parseMmdBenchmarkCurve(rows: RawRow[]): BenchmarkRow[] {
  const out: BenchmarkRow[] = [];
  for (const row of rows) {
    const date = dateValue(first(row, ["date", "trade_date", "pricing_date", "curve_date", "mmd_date"]));
    if (!date) {
      continue;
    }
    const dateLabel = dateKey(date);
    for (const [key, value] of Object.entries(row)) {
      if (["date", "trade_date", "pricing_date", "curve_date", "mmd_date"].includes(key)) {
        continue;
      }
      const tenorMatch = key.toUpperCase().match(/(?:^|_)([1-9]|[1-3][0-9]|40)Y$/) ?? key.toUpperCase().match(/([1-9]|[1-3][0-9]|40)Y/);
      if (!tenorMatch) {
        continue;
      }
      const benchmarkYield = numericValue(value);
      if (benchmarkYield === null) {
        continue;
      }
      out.push({
        date: dateLabel,
        tenor: `${Number(tenorMatch[1])}Y`,
        benchmark_yield: benchmarkYield,
        benchmark_source: "Uploaded MMD fallback",
        observation_count: 1
      });
    }
  }
  return out.sort((a, b) => `${a.date}|${a.tenor}`.localeCompare(`${b.date}|${b.tenor}`));
}

function parseTradeIndexTenor(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value.toUpperCase().trim().match(/(\d{1,2})\s*Y?$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1) {
    return null;
  }
  return `${Math.min(year, MAX_MATURITY_YEAR)}Y`;
}

function nearestBenchmarkTenor(bucket: string): string {
  const year = Number(bucket.replace("Y", ""));
  if (year <= 2) {
    return `${year}Y`;
  }
  if (year <= 7) {
    return "5Y";
  }
  if (year <= 15) {
    return "10Y";
  }
  if (year <= 25) {
    return "20Y";
  }
  return "30Y";
}

function buildTradeIndexCurve(trades: TradeRow[]): BenchmarkRow[] {
  const buckets = new Map<string, number[]>();
  for (const trade of trades) {
    if (!trade.trade_date || trade.index_rate === null) {
      continue;
    }
    const tenor = parseTradeIndexTenor(trade.index);
    if (!tenor) {
      continue;
    }
    const key = `${dateKey(trade.trade_date)}|${tenor}`;
    buckets.set(key, [...(buckets.get(key) ?? []), trade.index_rate]);
  }

  return Array.from(buckets.entries())
    .map(([key, values]) => {
      const [date, tenor] = key.split("|");
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return {
        date,
        tenor,
        benchmark_yield: median,
        benchmark_source: "Trade Sheet Index / Index Rate",
        observation_count: values.length
      };
    })
    .sort((a, b) => `${a.date}|${a.tenor}`.localeCompare(`${b.date}|${b.tenor}`));
}

function buildSpreadObservations(trades: TradeRow[], benchmarkCurve: BenchmarkRow[]): SpreadObservation[] {
  const benchmark = new Map(benchmarkCurve.map((row) => [`${row.date}|${row.tenor}`, row]));
  const groups = new Map<string, TradeRow[]>();

  for (const trade of trades) {
    if (!trade.trade_date || !trade.maturity_bucket || trade.yield === null) {
      continue;
    }
    if (!MATURITY_BUCKET_ORDER.includes(trade.maturity_bucket)) {
      continue;
    }
    const key = `${trade.issuer}|${dateKey(trade.trade_date)}|${trade.maturity_bucket}`;
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }

  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const [issuer, tradeDate, bucket] = key.split("|");
      const tenor = nearestBenchmarkTenor(bucket);
      const curve = benchmark.get(`${tradeDate}|${tenor}`);
      if (!curve) {
        return null;
      }
      const avgYield = rows.reduce((sum, row) => sum + (row.yield ?? 0), 0) / rows.length;
      const totalTradeAmount = rows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0);
      return {
        issuer,
        trade_date: tradeDate,
        maturity_bucket: bucket,
        avg_yield: avgYield,
        trade_count: rows.length,
        total_trade_amount: totalTradeAmount,
        tenor,
        benchmark_yield: curve.benchmark_yield,
        spread_to_benchmark_bps: (avgYield - curve.benchmark_yield) * 100
      };
    })
    .filter((row): row is SpreadObservation => row !== null)
    .sort((a, b) => `${a.issuer}|${a.maturity_bucket}|${a.trade_date}`.localeCompare(`${b.issuer}|${b.maturity_bucket}|${b.trade_date}`));
}

function roundOrNull(value: number | null | undefined, digits = 2): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function buildLiquiditySignal(trades: TradeRow[], latestDate: string, periodDays: number) {
  const latest = new Date(`${latestDate}T00:00:00Z`);
  const cutoff = new Date(latest);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const dated = trades.filter((trade) => trade.trade_date);
  if (!dated.length) {
    return { liquidity_score: null, trade_count: 0, total_trade_amount: 0, days_since_last_trade: null };
  }
  const latestTrade = dated.reduce((max, trade) => {
    const time = trade.trade_date?.getTime() ?? 0;
    return Math.max(max, time);
  }, 0);
  const windowRows = dated.filter((trade) => (trade.trade_date?.getTime() ?? 0) >= cutoff.getTime());
  const tradeCount = windowRows.length;
  const totalAmount = windowRows.reduce((sum, trade) => sum + (trade.trade_amount ?? 0), 0);
  const daysSinceLast = Math.max(0, Math.floor((latest.getTime() - latestTrade) / (24 * 60 * 60 * 1000)));
  const score = Math.min(tradeCount / 10, 1) * 35 + Math.min(totalAmount / 5_000_000, 1) * 35 + Math.max(0, 1 - Math.min(daysSinceLast / 180, 1)) * 30;
  return {
    liquidity_score: roundOrNull(score, 1),
    trade_count: tradeCount,
    total_trade_amount: Math.round(totalAmount),
    days_since_last_trade: daysSinceLast
  };
}

function classifySide(value: string | null): "Buy" | "Sell" | "Other" {
  const text = String(value ?? "").trim().toLowerCase();
  if (["s", "sell", "sold", "sld", "customer sell", "cust sell", "cs"].includes(text)) {
    return "Sell";
  }
  if (["b", "buy", "bought", "purchase", "customer buy", "cust buy", "cb"].includes(text)) {
    return "Buy";
  }
  return "Other";
}

function buildFlowSignal(trades: TradeRow[], latestDate: string, periodDays: number) {
  const latest = new Date(`${latestDate}T00:00:00Z`);
  const cutoff = new Date(latest);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const windowRows = trades.filter((trade) => trade.trade_date && trade.trade_date.getTime() >= cutoff.getTime());
  const buyAmount = windowRows.filter((trade) => classifySide(trade.trade_type) === "Buy").reduce((sum, trade) => sum + (trade.trade_amount ?? 0), 0);
  const sellAmount = windowRows.filter((trade) => classifySide(trade.trade_type) === "Sell").reduce((sum, trade) => sum + (trade.trade_amount ?? 0), 0);
  const denom = buyAmount + sellAmount;
  return {
    sell_buy_imbalance: denom > 0 ? roundOrNull((sellAmount - buyAmount) / denom, 4) : null,
    classified_buy_amount: Math.round(buyAmount),
    classified_sell_amount: Math.round(sellAmount)
  };
}

function labelSignal(spreadChange: number | null, percentile: number | null, liquidity: number | null, flow: number | null): string {
  let score = 0;
  if (spreadChange !== null && spreadChange >= 15) {
    score += 1;
  }
  if (percentile !== null && percentile >= 75) {
    score += 1;
  }
  if (liquidity !== null && liquidity >= 60) {
    score += 1;
  }
  if (flow !== null && flow >= 0.25) {
    score += 0.5;
  }
  if (score >= 3) {
    return "Potential Relative Value Candidate";
  }
  if (score >= 2) {
    return "Watchlist Candidate";
  }
  if (score <= 0.5 && percentile !== null && percentile <= 25) {
    return "Potentially Rich / Lower Priority";
  }
  return "Neutral / Needs More Evidence";
}

function percentileRanks(values: Array<number | null>): Array<number | null> {
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null && Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
  const ranks = Array<number | null>(values.length).fill(null);
  if (!valid.length) {
    return ranks;
  }
  valid.forEach((item, sortedIndex) => {
    ranks[item.index] = valid.length === 1 ? 1 : (sortedIndex + 1) / valid.length;
  });
  return ranks;
}

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function latestBenchmarkForBucket(benchmarkCurve: BenchmarkRow[], latestDate: Date, bucket: string | null): BenchmarkRow | null {
  if (!bucket) {
    return null;
  }
  const tenor = nearestBenchmarkTenor(bucket);
  const latestTime = latestDate.getTime();
  const candidates = benchmarkCurve
    .filter((row) => row.tenor === tenor && new Date(`${row.date}T00:00:00Z`).getTime() <= latestTime)
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates[candidates.length - 1] ?? null;
}

function classifyCandidate(candidate: SecurityCandidate): string {
  const spread = candidate.spread_to_benchmark_bps;
  const liquidity = candidate.liquidity_score;
  if (spread !== null && spread >= 25 && liquidity !== null && liquidity >= 70) {
    return "Wide + Liquid";
  }
  if (spread !== null && spread >= 25) {
    return "Wide / Liquidity Check";
  }
  if (spread !== null && spread <= -10 && liquidity !== null && liquidity >= 50) {
    return "Rich / Lower Priority";
  }
  if (liquidity !== null && liquidity < 35) {
    return "Liquidity Constrained";
  }
  return "Monitor";
}

function buildSecurityScreener(trades: TradeRow[], benchmarkCurve: BenchmarkRow[], periodDays: number): SecurityCandidate[] {
  const dated = trades.filter((trade) => trade.cusip && trade.trade_date && trade.yield !== null);
  if (!dated.length) {
    return [];
  }
  const globalLatestTime = Math.max(...dated.map((trade) => trade.trade_date?.getTime() ?? 0));
  const globalLatest = new Date(globalLatestTime);
  const cutoff = new Date(globalLatest);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const windowRows = dated.filter((trade) => (trade.trade_date?.getTime() ?? 0) >= cutoff.getTime());
  const sourceRows = windowRows.length ? windowRows : dated;

  const byCusip = new Map<string, TradeRow[]>();
  for (const trade of sourceRows) {
    if (!trade.cusip) {
      continue;
    }
    byCusip.set(trade.cusip, [...(byCusip.get(trade.cusip) ?? []), trade]);
  }

  const base = Array.from(byCusip.entries()).map(([cusip, rows]) => {
    const latestTradeTime = Math.max(...rows.map((row) => row.trade_date?.getTime() ?? 0));
    const latestTradeDate = new Date(latestTradeTime);
    const maturity = mode(rows.map((row) => row.maturity_bucket ?? ""));
    const benchmark = latestBenchmarkForBucket(benchmarkCurve, latestTradeDate, maturity);
    const yields = rows.map((row) => row.yield).filter((value): value is number => value !== null);
    const prices = rows.map((row) => row.price).filter((value): value is number => value !== null);
    const avgYield = yields.length ? yields.reduce((sum, value) => sum + value, 0) / yields.length : null;
    const benchmarkYield = benchmark?.benchmark_yield ?? null;
    const spread = avgYield !== null && benchmarkYield !== null ? (avgYield - benchmarkYield) * 100 : null;
    const totalAmount = rows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0);
    const latestRow = rows.find((row) => row.trade_date?.getTime() === latestTradeTime) ?? rows[rows.length - 1];
    return {
      cusip,
      issuer: latestRow.issuer,
      maturity_bucket: maturity,
      latest_trade_date: latestTradeTime ? dateKey(latestTradeDate) : null,
      trade_count: rows.length,
      avg_yield: roundOrNull(avgYield, 3),
      benchmark_yield: roundOrNull(benchmarkYield, 3),
      spread_to_benchmark_bps: roundOrNull(spread, 2),
      liquidity_score: null,
      total_trade_amount: Math.round(totalAmount),
      avg_trade_amount: rows.length ? Math.round(totalAmount / rows.length) : 0,
      avg_price: roundOrNull(prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null, 3),
      days_since_last_trade: Math.max(0, Math.floor((globalLatest.getTime() - latestTradeTime) / (24 * 60 * 60 * 1000))),
      rv_score: null,
      signal: "Monitor",
      evidence: [] as string[]
    } satisfies SecurityCandidate;
  });

  const countRanks = percentileRanks(base.map((row) => row.trade_count));
  const amountRanks = percentileRanks(base.map((row) => row.total_trade_amount));
  const recencyRanks = percentileRanks(base.map((row) => (row.days_since_last_trade === null ? null : -row.days_since_last_trade)));
  const spreadRanks = percentileRanks(base.map((row) => row.spread_to_benchmark_bps));

  const withLiquidity = base.map((candidate, index) => {
    const liquidity =
      (countRanks[index] ?? 0) * 35 +
      (amountRanks[index] ?? 0) * 35 +
      (recencyRanks[index] ?? 0) * 30;
    return {
      ...candidate,
      liquidity_score: roundOrNull(liquidity, 1)
    };
  });

  const liquidityRanks = percentileRanks(withLiquidity.map((row) => row.liquidity_score));
  const rvScored = withLiquidity.map((candidate, index) => {
    const rv =
      (spreadRanks[index] ?? 0) * 45 +
      (liquidityRanks[index] ?? 0) * 35 +
      (countRanks[index] ?? 0) * 10 +
      (amountRanks[index] ?? 0) * 10;
    const scored = {
      ...candidate,
      rv_score: roundOrNull(rv, 1)
    };
    const signal = classifyCandidate(scored);
    const evidence = [
      scored.spread_to_benchmark_bps === null
        ? "Spread unavailable because no matching benchmark was found."
        : `Spread is ${scored.spread_to_benchmark_bps >= 0 ? "+" : ""}${scored.spread_to_benchmark_bps.toFixed(1)} bps.`,
      `Liquidity score is ${scored.liquidity_score?.toFixed(1) ?? "N/A"} from ${scored.trade_count} trade(s).`,
      `Total par traded is ${scored.total_trade_amount.toLocaleString()}.`
    ];
    return { ...scored, signal, evidence };
  });

  const peerSpreads = rvScored
    .map((row) => row.spread_to_benchmark_bps)
    .filter((value): value is number => value !== null);
  const peerMedian = median(peerSpreads);

  return rvScored
    .map((candidate) => ({
      ...candidate,
      evidence:
        peerMedian === null || candidate.spread_to_benchmark_bps === null
          ? candidate.evidence
          : [
              ...candidate.evidence,
              `Peer-median gap is ${(candidate.spread_to_benchmark_bps - peerMedian) >= 0 ? "+" : ""}${(candidate.spread_to_benchmark_bps - peerMedian).toFixed(1)} bps.`
            ]
    }))
    .sort((a, b) => (b.rv_score ?? -Infinity) - (a.rv_score ?? -Infinity))
    .slice(0, 100);
}

function buildIssuerCurve(trades: TradeRow[], benchmarkCurve: BenchmarkRow[], issuer: string, periodDays: number): CurvePoint[] {
  const issuerRows = trades.filter((trade) => trade.issuer === issuer && trade.trade_date && trade.maturity_bucket && trade.yield !== null);
  if (!issuerRows.length) {
    return [];
  }
  const latestDate = new Date(Math.max(...issuerRows.map((trade) => trade.trade_date?.getTime() ?? 0)));
  const cutoff = new Date(latestDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const windowRows = issuerRows.filter((trade) => (trade.trade_date?.getTime() ?? 0) >= cutoff.getTime());
  const sourceRows = windowRows.length ? windowRows : issuerRows;
  const byBucket = new Map<string, TradeRow[]>();
  for (const trade of sourceRows) {
    if (!trade.maturity_bucket) {
      continue;
    }
    byBucket.set(trade.maturity_bucket, [...(byBucket.get(trade.maturity_bucket) ?? []), trade]);
  }

  return MATURITY_BUCKET_ORDER.map((bucket) => {
    const rows = byBucket.get(bucket) ?? [];
    const yields = rows.map((row) => row.yield).filter((value): value is number => value !== null);
    const issuerYield = yields.length ? yields.reduce((sum, value) => sum + value, 0) / yields.length : null;
    const benchmark = latestBenchmarkForBucket(benchmarkCurve, latestDate, bucket);
    const benchmarkYield = benchmark?.benchmark_yield ?? null;
    return {
      maturity_bucket: bucket,
      maturity_year: Number(bucket.replace("Y", "")),
      issuer_yield: roundOrNull(issuerYield, 3),
      benchmark_yield: roundOrNull(benchmarkYield, 3),
      spread_bps: issuerYield !== null && benchmarkYield !== null ? roundOrNull((issuerYield - benchmarkYield) * 100, 2) : null,
      trade_count: rows.length,
      total_trade_amount: Math.round(rows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0))
    };
  }).filter((point) => point.issuer_yield !== null || point.benchmark_yield !== null);
}

function buildSpreadTrend(spreadObs: SpreadObservation[], issuer: string, maturityBucket: string | null): TrendPoint[] {
  if (!maturityBucket) {
    return [];
  }
  return spreadObs
    .filter((row) => row.issuer === issuer && row.maturity_bucket === maturityBucket)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .slice(-MAX_TREND_POINTS)
    .map((row) => ({
      date: row.trade_date,
      spread_bps: roundOrNull(row.spread_to_benchmark_bps, 2) ?? 0,
      avg_yield: roundOrNull(row.avg_yield, 3) ?? 0,
      benchmark_yield: roundOrNull(row.benchmark_yield, 3) ?? 0,
      trade_count: row.trade_count
    }));
}

function buildMonthlyActivity(trades: TradeRow[], issuer: string): ActivityPoint[] {
  const byMonth = new Map<string, { trade_count: number; total_trade_amount: number }>();
  for (const trade of trades) {
    if (trade.issuer !== issuer || !trade.trade_date) {
      continue;
    }
    const month = dateKey(trade.trade_date).slice(0, 7);
    const current = byMonth.get(month) ?? { trade_count: 0, total_trade_amount: 0 };
    current.trade_count += 1;
    current.total_trade_amount += trade.trade_amount ?? 0;
    byMonth.set(month, current);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([month, value]) => ({
      month,
      trade_count: value.trade_count,
      total_trade_amount: Math.round(value.total_trade_amount)
    }));
}

function buildIssuerOptions(trades: TradeRow[]): IssuerOption[] {
  const byIssuer = new Map<string, TradeRow[]>();
  for (const trade of trades) {
    byIssuer.set(trade.issuer, [...(byIssuer.get(trade.issuer) ?? []), trade]);
  }
  return Array.from(byIssuer.entries())
    .map(([issuer, rows]) => {
      const dates = rows.map((row) => row.trade_date).filter((value): value is Date => value !== null);
      return {
        issuer,
        sector: mode(rows.map((row) => row.sector ?? "Unknown")) ?? "Unknown",
        primary_type: mode(rows.map((row) => row.primary_type ?? "")),
        trade_count: rows.length,
        cusip_count: new Set(rows.map((row) => row.cusip).filter(Boolean)).size,
        latest_trade_date: dates.length ? dateKey(new Date(Math.max(...dates.map((date) => date.getTime())))) : null
      };
    })
    .sort((a, b) => b.trade_count - a.trade_count || a.issuer.localeCompare(b.issuer));
}

function buildDataHealth(input: {
  tradeFiles: number;
  rawRows: number;
  trades: TradeRow[];
  duplicateRowsRemoved: number;
  benchmarkCurve: BenchmarkRow[];
  bondReferenceRows: number;
  issuerMappingRows: number;
  mmdRows: number;
}): DataHealth {
  const dates = input.trades.map((row) => row.trade_date).filter((value): value is Date => value !== null);
  return {
    trade_files: input.tradeFiles,
    trade_rows_raw: input.rawRows,
    model_ready_rows: input.trades.length,
    duplicate_rows_removed: input.duplicateRowsRemoved,
    issuers: new Set(input.trades.map((row) => row.issuer).filter(Boolean)).size,
    cusips: new Set(input.trades.map((row) => row.cusip).filter(Boolean)).size,
    first_trade_date: dates.length ? dateKey(new Date(Math.min(...dates.map((date) => date.getTime())))) : null,
    latest_trade_date: dates.length ? dateKey(new Date(Math.max(...dates.map((date) => date.getTime())))) : null,
    benchmark_source: input.benchmarkCurve[0]?.benchmark_source ?? null,
    reference_files: {
      bond_reference: input.bondReferenceRows > 0,
      issuer_mapping: input.issuerMappingRows > 0,
      uploaded_mmd: input.mmdRows > 0
    }
  };
}

function fieldCoverage(rows: RawRow[], validation: PayloadValidation): FieldCoverageRow[] {
  const aliases: Record<string, string[]> = {
    cusip: ["cusip", "cusip9", "security_id"],
    trade_date: ["trade_date", "trade date", "date", "transaction_date", "td_time", "td & time"],
    yield: ["ytw", "ytm", "msrb_yld", "yield", "yield_to_worst", "yield to worst"],
    maturity: ["mty", "maturity", "maturity_date", "maturity date"],
    trade_amount: ["qty_m", "qty (m)", "trade_amount", "trade amount", "par_amount", "quantity", "amount"],
    index_rate: ["bnch_rate", "bnch rate", "index_rate", "benchmark_rate"],
    spread: ["spread_bp", "spread bp", "spread_bps", "spread"],
    trade_type: ["tde_type", "tde type", "trade_type", "side", "buy_sell"],
    price: ["price", "trade_price", "execution_price"],
    ratings: ["m", "s", "f", "ratings_m_s_f", "ratings m/s/f", "ratings", "rating"]
  };
  return Object.entries(aliases).map(([field, fieldAliases]) => {
    const detected = validation.detected_fields[field];
    const nonNullRows = rows.filter((row) => first(row, fieldAliases) !== null).length;
    return {
      field,
      detected_column: detected,
      non_null_rows: nonNullRows,
      coverage_pct: rows.length ? roundOrNull((nonNullRows / rows.length) * 100, 1) ?? 0 : 0,
      required: ["cusip", "trade_date", "yield"].includes(field)
    };
  });
}

function buildDataAuditCenter(input: {
  rows: RawRow[];
  tradesBeforeDedupe: number;
  trades: TradeRow[];
  duplicateRowsRemoved: number;
  validation: PayloadValidation;
  readiness: FileReadinessReport[];
  spreadObs: SpreadObservation[];
  bondReferenceCusips?: Set<string>;
  issuerMappingIssuers?: Set<string>;
}): DataAuditCenter {
  const benchmarkEligible = input.trades.filter((trade) => trade.trade_date && trade.maturity_bucket && trade.yield !== null).length;
  const benchmarkMatchRate = benchmarkEligible ? (input.spreadObs.length / benchmarkEligible) * 100 : 0;
  const uniqueCusips = new Set(input.trades.map((trade) => trade.cusip).filter((value): value is string => Boolean(value)));
  const bondMatches = input.bondReferenceCusips
    ? Array.from(uniqueCusips).filter((cusip) => input.bondReferenceCusips?.has(cusip)).length
    : null;
  const issuerUniverse = new Set(input.trades.map((trade) => trade.issuer).filter(Boolean));
  const issuerMatches = input.issuerMappingIssuers
    ? Array.from(issuerUniverse).filter((issuer) => input.issuerMappingIssuers?.has(issuer)).length
    : null;
  const warnings = [
    ...input.readiness.flatMap((item) => item.warnings.map((warning) => `${item.dataset}: ${warning}`)),
    ...(benchmarkEligible && benchmarkMatchRate < 70 ? [`Benchmark match rate is ${benchmarkMatchRate.toFixed(1)}%; review uploaded index/MMD coverage.`] : []),
    ...(input.validation.missing_required.length ? [`Missing required detected fields: ${input.validation.missing_required.join(", ")}.`] : []),
    ...(input.trades.length === 0 ? ["No model-ready trades were generated."] : [])
  ];
  const overallStatus: DataAuditCenter["overall_status"] =
    input.trades.length === 0 || input.validation.missing_required.length ? "blocked" : warnings.length ? "review" : "pass";
  return {
    overall_status: overallStatus,
    steps: [
      {
        step: "File ingestion",
        status: input.rows.length ? "pass" : "blocked",
        rows_in: input.rows.length,
        rows_out: input.rows.length,
        rejected_rows: 0,
        notes: [`${input.readiness.length.toLocaleString()} uploaded dataset(s) evaluated.`]
      },
      {
        step: "Required-field mapping",
        status: input.validation.missing_required.length ? "blocked" : input.validation.missing_recommended.length ? "review" : "pass",
        rows_in: input.rows.length,
        rows_out: input.tradesBeforeDedupe,
        rejected_rows: Math.max(0, input.rows.length - input.tradesBeforeDedupe),
        notes: [
          input.validation.missing_required.length ? `Missing required: ${input.validation.missing_required.join(", ")}.` : "CUSIP, trade date, and yield fields were detected.",
          input.validation.missing_recommended.length ? `Missing recommended: ${input.validation.missing_recommended.join(", ")}.` : "Recommended fields have broad coverage."
        ]
      },
      {
        step: "Duplicate removal",
        status: "pass",
        rows_in: input.tradesBeforeDedupe,
        rows_out: input.trades.length,
        rejected_rows: input.duplicateRowsRemoved,
        notes: [`Removed ${input.duplicateRowsRemoved.toLocaleString()} exact duplicate trade row(s).`]
      },
      {
        step: "Benchmark matching",
        status: benchmarkEligible === 0 ? "blocked" : benchmarkMatchRate < 70 ? "review" : "pass",
        rows_in: benchmarkEligible,
        rows_out: input.spreadObs.length,
        rejected_rows: Math.max(0, benchmarkEligible - input.spreadObs.length),
        notes: [`Matched ${benchmarkMatchRate.toFixed(1)}% of eligible issuer/date/bucket observations to benchmark tenors.`]
      },
      {
        step: "CUSIP scoring",
        status: input.trades.length ? "pass" : "blocked",
        rows_in: input.trades.length,
        rows_out: uniqueCusips.size,
        rejected_rows: 0,
        notes: [`${uniqueCusips.size.toLocaleString()} unique CUSIP(s) available for screener and drilldown.`]
      }
    ],
    field_coverage: fieldCoverage(input.rows, input.validation),
    reconciliation: {
      raw_rows: input.rows.length,
      model_ready_rows: input.trades.length,
      duplicate_rows_removed: input.duplicateRowsRemoved,
      unmatched_benchmark_rows: Math.max(0, benchmarkEligible - input.spreadObs.length),
      benchmark_match_rate_pct: roundOrNull(benchmarkMatchRate, 1) ?? 0,
      cusip_reference_match_rate_pct:
        bondMatches === null ? null : roundOrNull(uniqueCusips.size ? (bondMatches / uniqueCusips.size) * 100 : 0, 1),
      issuer_mapping_match_rate_pct:
        issuerMatches === null ? null : roundOrNull(issuerUniverse.size ? (issuerMatches / issuerUniverse.size) * 100 : 0, 1)
    },
    warnings
  };
}

function scoreStatus(score: number | null): "pass" | "review" | "blocked" {
  if (score === null) {
    return "review";
  }
  if (score >= 90) {
    return "pass";
  }
  if (score >= 70) {
    return "review";
  }
  return "blocked";
}

function buildDataQualityScorecard(dataAudit: DataAuditCenter): DataQualityScorecard {
  const coverageByField = new Map(dataAudit.field_coverage.map((row) => [row.field, row.coverage_pct]));
  const requiredFields = ["cusip", "trade_date", "yield"]
    .map((field) => coverageByField.get(field))
    .filter((value): value is number => value !== undefined);
  const requiredScore = requiredFields.length ? requiredFields.reduce((sum, value) => sum + value, 0) / requiredFields.length : null;
  const maturityScore = coverageByField.get("maturity") ?? null;
  const amountScore = coverageByField.get("trade_amount") ?? null;
  const benchmarkScore = dataAudit.reconciliation.benchmark_match_rate_pct;
  const cusipReferenceScore = dataAudit.reconciliation.cusip_reference_match_rate_pct;
  const issuerMappingScore = dataAudit.reconciliation.issuer_mapping_match_rate_pct;
  const metrics: DataQualityScorecard["metrics"] = [
    {
      metric: "Required Field Coverage",
      score: roundOrNull(requiredScore, 1),
      status: scoreStatus(requiredScore),
      numerator: dataAudit.reconciliation.model_ready_rows,
      denominator: dataAudit.reconciliation.raw_rows,
      detail: "Average coverage across CUSIP, trade date, and yield fields."
    },
    {
      metric: "Maturity Quality",
      score: roundOrNull(maturityScore, 1),
      status: scoreStatus(maturityScore),
      numerator: null,
      denominator: dataAudit.reconciliation.raw_rows,
      detail: "Coverage of maturity data used to bucket securities and build curves."
    },
    {
      metric: "Trade Amount Coverage",
      score: roundOrNull(amountScore, 1),
      status: scoreStatus(amountScore),
      numerator: null,
      denominator: dataAudit.reconciliation.raw_rows,
      detail: "Coverage of par amount used for liquidity, activity, and bubble sizing."
    },
    {
      metric: "Benchmark Match",
      score: roundOrNull(benchmarkScore, 1),
      status: scoreStatus(benchmarkScore),
      numerator: dataAudit.reconciliation.model_ready_rows - dataAudit.reconciliation.unmatched_benchmark_rows,
      denominator: dataAudit.reconciliation.model_ready_rows,
      detail: "Share of eligible issuer/date/bucket observations matched to a benchmark tenor."
    },
    {
      metric: "CUSIP Reference Match",
      score: roundOrNull(cusipReferenceScore, 1),
      status: scoreStatus(cusipReferenceScore),
      numerator: null,
      denominator: null,
      detail: cusipReferenceScore === null ? "No bond reference file was uploaded; optional match is not included in the overall score." : "Share of CUSIPs matched to uploaded bond reference metadata."
    },
    {
      metric: "Issuer Mapping Match",
      score: roundOrNull(issuerMappingScore, 1),
      status: scoreStatus(issuerMappingScore),
      numerator: null,
      denominator: null,
      detail: issuerMappingScore === null ? "No issuer mapping file or manual sector override was uploaded; optional match is not included in the overall score." : "Share of issuer names matched to sector mapping metadata."
    }
  ];
  const weightedMetrics = [
    { score: requiredScore, weight: 0.3 },
    { score: maturityScore, weight: 0.15 },
    { score: amountScore, weight: 0.15 },
    { score: benchmarkScore, weight: 0.3 },
    { score: cusipReferenceScore, weight: 0.05 },
    { score: issuerMappingScore, weight: 0.05 }
  ].filter((item): item is { score: number; weight: number } => item.score !== null && Number.isFinite(item.score));
  const weightTotal = weightedMetrics.reduce((sum, item) => sum + item.weight, 0);
  const overall = weightTotal ? weightedMetrics.reduce((sum, item) => sum + item.score * item.weight, 0) / weightTotal : null;
  return {
    overall_score: roundOrNull(overall, 1),
    status: scoreStatus(overall),
    metrics
  };
}

function buildBenchmarkGovernance(input: {
  tradeIndexCurve: BenchmarkRow[];
  uploadedMmdCurve: BenchmarkRow[];
  activeCurve: BenchmarkRow[];
}): BenchmarkGovernance {
  const activeSource = input.activeCurve[0]?.benchmark_source ?? null;
  const activeTenors = new Set(input.activeCurve.map((row) => row.tenor));
  const missingActiveTenors = ["1Y", "2Y", "5Y", "10Y", "20Y", "30Y"].filter((tenor) => !activeTenors.has(tenor));
  const tradeIndexActive = input.tradeIndexCurve.length > 0;
  return {
    active_source: activeSource,
    policy: "Use Trade Sheet Index / Index Rate first because it is directly tied to uploaded trades; use uploaded MMD only when no trade-index curve can be formed.",
    trade_index_points: input.tradeIndexCurve.length,
    uploaded_mmd_points: input.uploadedMmdCurve.length,
    active_points: input.activeCurve.length,
    fallback_points_used: tradeIndexActive ? 0 : input.uploadedMmdCurve.length,
    missing_active_tenors: missingActiveTenors,
    rating_curve_selector: "General market curve; rating-specific spread assumptions are disclosed below and not silently applied.",
    spread_assumptions: [
      { rating: "AAA", spread_bps: 0, source: "Base benchmark curve" },
      { rating: "AA", spread_bps: 8, source: "Transparent screening assumption" },
      { rating: "A", spread_bps: 25, source: "Transparent screening assumption" },
      { rating: "BBB", spread_bps: 60, source: "Transparent screening assumption" }
    ],
    source_priority: [
      {
        source: "Trade Sheet Index / Index Rate",
        status: input.tradeIndexCurve.length ? "active" : "missing",
        points: input.tradeIndexCurve.length,
        notes: input.tradeIndexCurve.length ? "Primary source used for benchmark-dependent analytics." : "No usable trade-index benchmark points detected."
      },
      {
        source: "Uploaded MMD",
        status: input.tradeIndexCurve.length ? (input.uploadedMmdCurve.length ? "fallback" : "missing") : input.uploadedMmdCurve.length ? "active" : "missing",
        points: input.uploadedMmdCurve.length,
        notes: input.tradeIndexCurve.length ? "Available only for audit/fallback review." : "Used when trade-index benchmark is unavailable."
      }
    ]
  };
}

function buildSpreadMovementLadder(spreadObs: SpreadObservation[], issuer: string): SpreadMovementPoint[] {
  const windows: Array<[keyof Omit<SpreadMovementPoint, "maturity_bucket" | "latest_spread_bps">, number]> = [
    ["move_1w_bps", 7],
    ["move_1m_bps", 30],
    ["move_3m_bps", 90],
    ["move_6m_bps", 180],
    ["move_1y_bps", 365]
  ];
  return MATURITY_BUCKET_ORDER.map((bucket) => {
    const obs = spreadObs
      .filter((row) => row.issuer === issuer && row.maturity_bucket === bucket)
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    if (!obs.length) {
      return null;
    }
    const latest = obs[obs.length - 1];
    const latestDate = new Date(`${latest.trade_date}T00:00:00Z`);
    const point: SpreadMovementPoint = {
      maturity_bucket: bucket,
      latest_spread_bps: roundOrNull(latest.spread_to_benchmark_bps, 2),
      move_1w_bps: null,
      move_1m_bps: null,
      move_3m_bps: null,
      move_6m_bps: null,
      move_1y_bps: null
    };
    for (const [field, days] of windows) {
      const target = new Date(latestDate);
      target.setUTCDate(target.getUTCDate() - days);
      const prior = obs.filter((row) => new Date(`${row.trade_date}T00:00:00Z`).getTime() <= target.getTime()).at(-1);
      point[field] = prior ? roundOrNull(latest.spread_to_benchmark_bps - prior.spread_to_benchmark_bps, 2) : null;
    }
    return point;
  }).filter((point): point is SpreadMovementPoint => point !== null);
}

function buildLiquidityByBucket(trades: TradeRow[], issuer: string, periodDays: number): LiquidityPoint[] {
  const issuerRows = trades.filter((trade) => trade.issuer === issuer && trade.maturity_bucket);
  if (!issuerRows.length) {
    return [];
  }
  const latestTime = Math.max(...issuerRows.map((row) => row.trade_date?.getTime() ?? 0));
  const latest = new Date(latestTime);
  const cutoff = new Date(latest);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const points: Array<LiquidityPoint | null> = MATURITY_BUCKET_ORDER.map((bucket) => {
    const rows = issuerRows.filter((row) => row.maturity_bucket === bucket && row.trade_date && row.trade_date.getTime() >= cutoff.getTime());
    if (!rows.length) {
      return null;
    }
    const rowLatest = Math.max(...rows.map((row) => row.trade_date?.getTime() ?? 0));
    const total = rows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0);
    const days = Math.max(0, Math.floor((latest.getTime() - rowLatest) / (24 * 60 * 60 * 1000)));
    const score = Math.min(rows.length / 8, 1) * 40 + Math.min(total / 5_000_000, 1) * 35 + Math.max(0, 1 - Math.min(days / 180, 1)) * 25;
    return {
      maturity_bucket: bucket,
      trade_count: rows.length,
      cusip_count: new Set(rows.map((row) => row.cusip).filter(Boolean)).size,
      total_trade_amount: Math.round(total),
      latest_trade_date: dateKey(new Date(rowLatest)),
      days_since_last_trade: days,
      liquidity_score: roundOrNull(score, 1)
    };
  });
  return points.filter((point): point is LiquidityPoint => point !== null);
}

function tradeWindowRows(trades: TradeRow[], issuer: string, periodDays: number): TradeRow[] {
  const issuerRows = trades.filter((trade) => trade.issuer === issuer && trade.trade_date);
  if (!issuerRows.length) {
    return [];
  }
  const latest = new Date(Math.max(...issuerRows.map((row) => row.trade_date?.getTime() ?? 0)));
  const cutoff = new Date(latest);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const windowRows = issuerRows.filter((row) => (row.trade_date?.getTime() ?? 0) >= cutoff.getTime());
  return windowRows.length ? windowRows : issuerRows;
}

function bucketDistribution(rows: TradeRow[], buckets: Array<{ label: string; test: (row: TradeRow) => boolean }>): DistributionPoint[] {
  const totalRows = Math.max(rows.length, 1);
  return buckets.map((bucket) => {
    const bucketRows = rows.filter(bucket.test);
    return {
      bucket: bucket.label,
      trade_count: bucketRows.length,
      cusip_count: new Set(bucketRows.map((row) => row.cusip).filter(Boolean)).size,
      total_trade_amount: Math.round(bucketRows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0)),
      share_pct: roundOrNull((bucketRows.length / totalRows) * 100, 1) ?? 0
    };
  }).filter((point) => point.trade_count > 0);
}

function buildTradeSizeDistribution(trades: TradeRow[], issuer: string, periodDays: number): DistributionPoint[] {
  const rows = tradeWindowRows(trades, issuer, periodDays).filter((row) => row.trade_amount !== null);
  return bucketDistribution(rows, [
    { label: "<100k", test: (row) => (row.trade_amount ?? 0) < 100_000 },
    { label: "100k-250k", test: (row) => (row.trade_amount ?? 0) >= 100_000 && (row.trade_amount ?? 0) < 250_000 },
    { label: "250k-500k", test: (row) => (row.trade_amount ?? 0) >= 250_000 && (row.trade_amount ?? 0) < 500_000 },
    { label: "500k-1mm", test: (row) => (row.trade_amount ?? 0) >= 500_000 && (row.trade_amount ?? 0) < 1_000_000 },
    { label: "1mm-5mm", test: (row) => (row.trade_amount ?? 0) >= 1_000_000 && (row.trade_amount ?? 0) < 5_000_000 },
    { label: "5mm+", test: (row) => (row.trade_amount ?? 0) >= 5_000_000 }
  ]);
}

function buildStalenessDistribution(candidates: SecurityCandidate[], issuer: string): DistributionPoint[] {
  const rows = candidates
    .filter((candidate) => candidate.issuer === issuer && candidate.days_since_last_trade !== null)
    .map((candidate) => ({
      trade_date: null,
      cusip: candidate.cusip,
      trade_amount: candidate.total_trade_amount,
      days_since_last_trade: candidate.days_since_last_trade
    }));
  const totalRows = Math.max(rows.length, 1);
  return [
    { label: "0-7D", min: 0, max: 7 },
    { label: "8-30D", min: 8, max: 30 },
    { label: "31-90D", min: 31, max: 90 },
    { label: "91-180D", min: 91, max: 180 },
    { label: "180D+", min: 181, max: Infinity }
  ].map((bucket) => {
    const bucketRows = rows.filter((row) => {
      const days = row.days_since_last_trade ?? Infinity;
      return days >= bucket.min && days <= bucket.max;
    });
    return {
      bucket: bucket.label,
      trade_count: bucketRows.length,
      cusip_count: bucketRows.length,
      total_trade_amount: Math.round(bucketRows.reduce((sum, row) => sum + row.trade_amount, 0)),
      share_pct: roundOrNull((bucketRows.length / totalRows) * 100, 1) ?? 0
    };
  }).filter((point) => point.trade_count > 0);
}

function buildTopCusipActivity(candidates: SecurityCandidate[], issuer: string): TopCusipActivityPoint[] {
  return candidates
    .filter((candidate) => candidate.issuer === issuer)
    .sort((a, b) => b.trade_count - a.trade_count || b.total_trade_amount - a.total_trade_amount)
    .slice(0, 15)
    .map((candidate) => ({
      cusip: candidate.cusip,
      maturity_bucket: candidate.maturity_bucket,
      trade_count: candidate.trade_count,
      total_trade_amount: candidate.total_trade_amount,
      days_since_last_trade: candidate.days_since_last_trade,
      liquidity_score: candidate.liquidity_score,
      spread_bps: candidate.spread_to_benchmark_bps
    }));
}

function latestSpreadByIssuerBucket(spreadObs: SpreadObservation[]) {
  const out = new Map<string, SpreadObservation>();
  for (const row of spreadObs) {
    const key = `${row.issuer}|${row.maturity_bucket}`;
    const existing = out.get(key);
    if (!existing || row.trade_date.localeCompare(existing.trade_date) > 0) {
      out.set(key, row);
    }
  }
  return out;
}

function buildPeerRv(spreadObs: SpreadObservation[], issuer: string): PeerRvPoint[] {
  const latest = latestSpreadByIssuerBucket(spreadObs);
  return MATURITY_BUCKET_ORDER.map((bucket) => {
    const issuerPoint = latest.get(`${issuer}|${bucket}`);
    if (!issuerPoint) {
      return null;
    }
    const peerValues = Array.from(latest.values())
      .filter((row) => row.maturity_bucket === bucket && row.issuer !== issuer)
      .map((row) => row.spread_to_benchmark_bps)
      .filter((value) => Number.isFinite(value));
    const peerMedian = median(peerValues);
    return {
      maturity_bucket: bucket,
      issuer_spread_bps: roundOrNull(issuerPoint.spread_to_benchmark_bps, 2),
      peer_median_spread_bps: roundOrNull(peerMedian, 2),
      peer_gap_bps: peerMedian === null ? null : roundOrNull(issuerPoint.spread_to_benchmark_bps - peerMedian, 2),
      issuer_trade_count: issuerPoint.trade_count,
      peer_issuer_count: peerValues.length
    };
  }).filter((point): point is PeerRvPoint => point !== null);
}

function buildCrossIssuerRv(trades: TradeRow[], securityScreener: SecurityCandidate[]): CrossIssuerRvPoint[] {
  const byIssuer = new Map<string, SecurityCandidate[]>();
  for (const candidate of securityScreener) {
    byIssuer.set(candidate.issuer, [...(byIssuer.get(candidate.issuer) ?? []), candidate]);
  }
  const options = buildIssuerOptions(trades);
  return options.map((option) => {
    const rows = byIssuer.get(option.issuer) ?? [];
    const spreads = rows.map((row) => row.spread_to_benchmark_bps).filter((value): value is number => value !== null);
    const liquidity = rows.map((row) => row.liquidity_score).filter((value): value is number => value !== null);
    const rv = rows.map((row) => row.rv_score).filter((value): value is number => value !== null);
    return {
      issuer: option.issuer,
      sector: option.sector,
      avg_spread_bps: roundOrNull(spreads.length ? spreads.reduce((sum, value) => sum + value, 0) / spreads.length : null, 2),
      liquidity_score: roundOrNull(liquidity.length ? liquidity.reduce((sum, value) => sum + value, 0) / liquidity.length : null, 1),
      trade_count: option.trade_count,
      cusip_count: option.cusip_count,
      rv_score: roundOrNull(rv.length ? rv.reduce((sum, value) => sum + value, 0) / rv.length : null, 1),
      latest_trade_date: option.latest_trade_date
    };
  }).sort((a, b) => (b.rv_score ?? -Infinity) - (a.rv_score ?? -Infinity));
}

function buildSpreadAttribution(payload: NextsrPayload, dashboardCurve: CurvePoint[]): SpreadAttributionPoint[] {
  const bucket = payload.maturity_bucket;
  const curvePoint = dashboardCurve.find((point) => point.maturity_bucket === bucket);
  if (!curvePoint || curvePoint.issuer_yield === null) {
    return [];
  }
  const benchmarkBps = (curvePoint.benchmark_yield ?? 0) * 100;
  const spreadBps = curvePoint.spread_bps ?? 0;
  return [
    { component: "Benchmark yield", value_bps: roundOrNull(benchmarkBps, 2) ?? 0 },
    { component: "Issuer spread", value_bps: roundOrNull(spreadBps, 2) ?? 0 },
    { component: "Issuer yield", value_bps: roundOrNull(curvePoint.issuer_yield * 100, 2) ?? 0 }
  ];
}

function buildHistoricalPercentiles(spreadObs: SpreadObservation[], issuer: string): HistoricalSpreadPoint[] {
  return MATURITY_BUCKET_ORDER.map((bucket) => {
    const obs = spreadObs
      .filter((row) => row.issuer === issuer && row.maturity_bucket === bucket)
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const values = obs.map((row) => row.spread_to_benchmark_bps).filter((value) => Number.isFinite(value));
    if (values.length < 2) {
      return null;
    }
    const current = values[values.length - 1];
    return {
      maturity_bucket: bucket,
      current_spread_bps: roundOrNull(current, 2),
      min_spread_bps: roundOrNull(Math.min(...values), 2),
      median_spread_bps: roundOrNull(median(values), 2),
      max_spread_bps: roundOrNull(Math.max(...values), 2),
      percentile: roundOrNull((values.filter((value) => value <= current).length / values.length) * 100, 1),
      observations: values.length
    };
  }).filter((point): point is HistoricalSpreadPoint => point !== null);
}

function curveValue(curve: CurvePoint[], year: number, field: "issuer_yield" | "spread_bps"): number | null {
  const point = curve.find((row) => row.maturity_year === year);
  return point?.[field] ?? null;
}

function buildCurveShape(curve: CurvePoint[]): CurveShapeMetric[] {
  const y5 = curveValue(curve, 5, "issuer_yield");
  const y10 = curveValue(curve, 10, "issuer_yield");
  const y30 = curveValue(curve, 30, "issuer_yield");
  const s10 = curveValue(curve, 10, "spread_bps");
  const s30 = curveValue(curve, 30, "spread_bps");
  const slope1030 = y10 !== null && y30 !== null ? (y30 - y10) * 100 : null;
  const butterfly = y5 !== null && y10 !== null && y30 !== null ? (y5 + y30 - 2 * y10) * 100 : null;
  const spreadSlope = s10 !== null && s30 !== null ? s30 - s10 : null;
  return [
    {
      metric: "10s30s Slope",
      value: roundOrNull(slope1030, 2),
      unit: "bps",
      readthrough: slope1030 === null ? "Not enough 10Y/30Y curve points." : slope1030 > 0 ? "Long-end yield is above the 10Y point." : "Long-end yield is flat or inverted versus 10Y."
    },
    {
      metric: "5s10s30s Butterfly",
      value: roundOrNull(butterfly, 2),
      unit: "bps",
      readthrough: butterfly === null ? "Not enough 5Y/10Y/30Y points." : butterfly > 0 ? "The 10Y point screens rich versus wings." : "The 10Y point screens cheap versus wings."
    },
    {
      metric: "Spread 10s30s",
      value: roundOrNull(spreadSlope, 2),
      unit: "bps",
      readthrough: spreadSlope === null ? "Not enough spread points." : spreadSlope > 0 ? "Long spread is wider than 10Y spread." : "Long spread is tighter than 10Y spread."
    }
  ];
}

function buildScenarioShock(trades: TradeRow[], issuer: string, shockBps = 25): ScenarioShockPoint[] {
  const rows = trades.filter((trade) => trade.issuer === issuer && trade.maturity_bucket);
  return MATURITY_BUCKET_ORDER.map((bucket) => {
    const bucketRows = rows.filter((row) => row.maturity_bucket === bucket);
    if (!bucketRows.length) {
      return null;
    }
    const year = Number(bucket.replace("Y", ""));
    const duration = Math.max(0.5, Math.min(25, year * 0.72));
    return {
      maturity_bucket: bucket,
      maturity_year: year,
      shock_bps: shockBps,
      duration_proxy: roundOrNull(duration, 2) ?? duration,
      approx_price_impact_pct: roundOrNull((-duration * shockBps) / 100, 2),
      trade_count: bucketRows.length,
      total_trade_amount: Math.round(bucketRows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0))
    };
  }).filter((point): point is ScenarioShockPoint => point !== null);
}

function buildDealerProxy(trades: TradeRow[], issuer: string, periodDays: number): DealerProxyPoint[] {
  const issuerRows = trades.filter((trade) => trade.issuer === issuer && trade.trade_date);
  if (!issuerRows.length) {
    return [];
  }
  const latest = new Date(Math.max(...issuerRows.map((row) => row.trade_date?.getTime() ?? 0)));
  const cutoff = new Date(latest);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const groups = new Map<"Buy" | "Sell" | "Other", DealerProxyPoint>();
  for (const side of ["Buy", "Sell", "Other"] as const) {
    groups.set(side, { side, trade_count: 0, total_trade_amount: 0 });
  }
  for (const trade of issuerRows.filter((row) => (row.trade_date?.getTime() ?? 0) >= cutoff.getTime())) {
    const side = classifySide(trade.trade_type);
    const item = groups.get(side) ?? { side, trade_count: 0, total_trade_amount: 0 };
    item.trade_count += 1;
    item.total_trade_amount += trade.trade_amount ?? 0;
    groups.set(side, item);
  }
  return Array.from(groups.values()).map((row) => ({ ...row, total_trade_amount: Math.round(row.total_trade_amount) }));
}

function buildBenchmarkAudit(benchmarkCurve: BenchmarkRow[]): BenchmarkAuditRow[] {
  return benchmarkCurve
    .slice()
    .sort((a, b) => `${b.date}|${a.tenor}`.localeCompare(`${a.date}|${b.tenor}`))
    .slice(0, MAX_BENCHMARK_AUDIT_ROWS)
    .map((row) => ({
      date: row.date,
      tenor: row.tenor,
      benchmark_yield: roundOrNull(row.benchmark_yield, 4) ?? row.benchmark_yield,
      benchmark_source: row.benchmark_source,
      observation_count: row.observation_count ?? 1
    }));
}

function buildSecurityDetails(trades: TradeRow[], securityScreener: SecurityCandidate[], benchmarkCurve: BenchmarkRow[]): SecurityDetail[] {
  const byCusip = new Map<string, TradeRow[]>();
  for (const trade of trades) {
    if (!trade.cusip) {
      continue;
    }
    byCusip.set(trade.cusip, [...(byCusip.get(trade.cusip) ?? []), trade]);
  }
  const candidateByCusip = new Map(securityScreener.map((candidate) => [candidate.cusip, candidate]));
  const prioritizedCusips = securityScreener
    .map((candidate) => candidate.cusip)
    .filter((cusip, index, list) => cusip && list.indexOf(cusip) === index)
    .slice(0, MAX_SECURITY_DETAILS);
  const detailEntries = prioritizedCusips.length
    ? prioritizedCusips
        .map((cusip) => [cusip, byCusip.get(cusip)] as const)
        .filter((entry): entry is readonly [string, TradeRow[]] => Boolean(entry[1]?.length))
    : Array.from(byCusip.entries()).slice(0, MAX_SECURITY_DETAILS);

  return detailEntries
    .map(([cusip, rows]) => {
      const sortedRows = rows
        .filter((row) => row.trade_date)
        .sort((a, b) => (a.trade_date?.getTime() ?? 0) - (b.trade_date?.getTime() ?? 0));
      const sourceRows = sortedRows.length ? sortedRows : rows;
      const latest = sourceRows[sourceRows.length - 1];
      const candidate = candidateByCusip.get(cusip);
      const yields = sourceRows.map((row) => row.yield).filter((value): value is number => value !== null);
      const prices = sourceRows.map((row) => row.price).filter((value): value is number => value !== null);
      const totalAmount = sourceRows.reduce((sum, row) => sum + (row.trade_amount ?? 0), 0);
      const benchmark = latest?.trade_date ? latestBenchmarkForBucket(benchmarkCurve, latest.trade_date, latest.maturity_bucket) : null;
      const latestSpread = latest?.yield !== null && latest?.yield !== undefined && benchmark?.benchmark_yield !== undefined ? (latest.yield - benchmark.benchmark_yield) * 100 : candidate?.spread_to_benchmark_bps ?? null;
      const tradePoints = sourceRows.slice(-MAX_TRADE_PATH_POINTS).map((row) => {
        const rowBenchmark = row.trade_date ? latestBenchmarkForBucket(benchmarkCurve, row.trade_date, row.maturity_bucket) : null;
        const spread = row.yield !== null && rowBenchmark?.benchmark_yield !== undefined ? (row.yield - rowBenchmark.benchmark_yield) * 100 : null;
        return {
          date: row.trade_date ? dateKey(row.trade_date) : null,
          yield: roundOrNull(row.yield, 3),
          price: roundOrNull(row.price, 3),
          trade_amount: Math.round(row.trade_amount ?? 0),
          spread_bps: roundOrNull(spread, 2),
          benchmark_yield: roundOrNull(rowBenchmark?.benchmark_yield ?? null, 3),
          trade_type: row.trade_type
        };
      });
      const readthrough = [
        `${cusip} has ${sourceRows.length.toLocaleString()} trade observation(s) in the uploaded universe.`,
        latestSpread === null ? "Spread to benchmark is unavailable for the latest trade." : `Latest spread screens at ${latestSpread >= 0 ? "+" : ""}${latestSpread.toFixed(1)} bps.`,
        candidate?.liquidity_score === null || candidate?.liquidity_score === undefined ? "Liquidity score is unavailable." : `Liquidity score is ${candidate.liquidity_score.toFixed(1)} based on trade count, par amount, and recency.`,
        candidate?.signal ? `Current screener signal: ${candidate.signal}.` : "Current screener signal is unavailable."
      ];
      return {
        cusip,
        issuer: latest?.issuer ?? candidate?.issuer ?? "Unknown",
        sector: latest?.sector ?? candidate?.sector ?? null,
        description: latest?.description ?? null,
        maturity_bucket: latest?.maturity_bucket ?? candidate?.maturity_bucket ?? null,
        maturity_date: latest?.maturity ? dateKey(latest.maturity) : null,
        coupon: roundOrNull(latest?.coupon, 3),
        latest_trade_date: latest?.trade_date ? dateKey(latest.trade_date) : candidate?.latest_trade_date ?? null,
        trade_count: sourceRows.length,
        total_trade_amount: Math.round(totalAmount),
        avg_yield: roundOrNull(yields.length ? yields.reduce((sum, value) => sum + value, 0) / yields.length : null, 3),
        latest_yield: roundOrNull(latest?.yield, 3),
        avg_price: roundOrNull(prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null, 3),
        latest_price: roundOrNull(latest?.price, 3),
        spread_to_benchmark_bps: roundOrNull(latestSpread, 2),
        liquidity_score: candidate?.liquidity_score ?? null,
        rv_score: candidate?.rv_score ?? null,
        signal: candidate?.signal ?? "Monitor",
        readthrough,
        evidence: candidate?.evidence ?? [],
        trades: tradePoints
      };
    })
    .sort((a, b) => (b.rv_score ?? -Infinity) - (a.rv_score ?? -Infinity))
    .slice(0, MAX_SECURITY_DETAILS);
}

function buildRecommendationNarrative(payload: NextsrPayload, candidates: SecurityCandidate[], peerRv: PeerRvPoint[]): RecommendationNarrative {
  const drivers: string[] = [];
  const caveats: string[] = [];
  const spread = payload.signals.spread.current_spread_bps;
  const spreadMove = payload.signals.spread.spread_change_bps;
  const percentile = payload.signals.spread.historical_percentile_1y;
  const liquidity = payload.signals.liquidity.liquidity_score;
  const flow = payload.signals.flow.sell_buy_imbalance;
  const strongestPeerGap = peerRv
    .map((row) => row.peer_gap_bps)
    .filter((value): value is number => value !== null)
    .sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? null;

  if (spread !== null) drivers.push(`Current selected-bucket spread is ${spread >= 0 ? "+" : ""}${spread.toFixed(1)} bps.`);
  if (spreadMove !== null) drivers.push(`${spreadMove >= 0 ? "Widened" : "Tightened"} ${Math.abs(spreadMove).toFixed(1)} bps over the selected lookback.`);
  if (percentile !== null) drivers.push(`Current spread is at the ${percentile.toFixed(0)}th percentile of available 1Y observations.`);
  if (liquidity !== null) drivers.push(`Liquidity score is ${liquidity.toFixed(1)} with ${payload.signals.liquidity.trade_count.toLocaleString()} recent trade(s).`);
  if (flow !== null) drivers.push(`Classified sell/buy flow imbalance is ${(flow * 100).toFixed(1)}%.`);
  if (strongestPeerGap !== null) drivers.push(`Largest peer gap observation is ${strongestPeerGap >= 0 ? "+" : ""}${strongestPeerGap.toFixed(1)} bps.`);

  if (payload.universe.benchmark_source === null) caveats.push("Benchmark-dependent analytics are limited because no benchmark source was detected.");
  if (payload.signals.liquidity.trade_count < 3) caveats.push("Recent liquidity sample is thin; interpret spread signals as screening indicators.");
  if (!candidates.length) caveats.push("No CUSIP-level screener candidates passed scoring.");
  if (!caveats.length) caveats.push("Signals are screening indicators, not investment recommendations.");

  const summary =
    payload.label === "Potential Relative Value Candidate"
      ? "The selected issuer/bucket screens as a relative-value candidate based on spread, liquidity, and flow evidence."
      : payload.label === "Watchlist Candidate"
        ? "The selected issuer/bucket belongs on watchlist pending stronger confirmation from liquidity, peer, or historical signals."
        : payload.label === "Potentially Rich / Lower Priority"
          ? "The selected issuer/bucket screens relatively rich or lower priority under the current rules."
          : "The selected issuer/bucket is neutral and needs more evidence before stronger action.";

  return {
    label: payload.label,
    summary,
    drivers,
    caveats,
    evidence: payload.evidence
  };
}

function metricTone(value: number | null, highGood = true): "positive" | "warning" | "negative" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (highGood) {
    if (value >= 70) return "positive";
    if (value >= 35) return "warning";
    return "negative";
  }
  if (value <= 25) return "positive";
  if (value <= 60) return "warning";
  return "negative";
}

function buildDeskSnapshot(input: {
  payload: NextsrPayload;
  dataHealth: DataHealth;
  dataAudit: DataAuditCenter;
  benchmarkGovernance: BenchmarkGovernance;
  recommendation: RecommendationNarrative;
  candidates: SecurityCandidate[];
  curveShape: CurveShapeMetric[];
}): DeskSnapshot {
  const { payload, dataHealth, dataAudit, benchmarkGovernance, recommendation, candidates, curveShape } = input;
  const spread = payload.signals.spread.current_spread_bps;
  const spreadMove = payload.signals.spread.spread_change_bps;
  const liquidity = payload.signals.liquidity.liquidity_score;
  const percentile = payload.signals.spread.historical_percentile_1y;
  const topCandidate = candidates[0];
  const benchmarkMatch = dataAudit.reconciliation.benchmark_match_rate_pct;
  const dataConfidence =
    dataAudit.overall_status === "pass" && benchmarkMatch >= 80 && payload.signals.liquidity.trade_count >= 5
      ? "High"
      : dataAudit.overall_status === "blocked" || benchmarkMatch < 40
        ? "Low"
        : "Medium";
  const direction = spreadMove === null ? "flat to inconclusive" : spreadMove >= 0 ? `widened ${spreadMove.toFixed(1)} bps` : `tightened ${Math.abs(spreadMove).toFixed(1)} bps`;
  const thesis = `${payload.issuer ?? "Selected issuer"} ${payload.maturity_bucket ?? "selected bucket"} screens as ${payload.label.toLowerCase()} with ${spread === null ? "unavailable" : `${spread.toFixed(1)} bps`} current spread.`;
  const marketRead = `Spread path is ${direction} over the selected lookback; liquidity score is ${liquidity === null ? "unavailable" : liquidity.toFixed(1)} and benchmark source is ${dataHealth.benchmark_source ?? "not detected"}.`;
  const actionBias =
    payload.label === "Potential Relative Value Candidate"
      ? "Prioritize CUSIP review and compare against same-bucket peers before adding to the desk watchlist."
      : payload.label === "Watchlist Candidate"
        ? "Keep on watchlist; wait for stronger liquidity or spread confirmation."
        : payload.label === "Potentially Rich / Lower Priority"
          ? "Deprioritize unless client demand or structure-specific reasons override the screen."
          : "Use as a monitoring read; no strong action signal from the current file alone.";
  const riskFlags = [
    ...recommendation.caveats,
    ...dataAudit.warnings.slice(0, 2),
    ...(benchmarkGovernance.fallback_points_used ? [`${benchmarkGovernance.fallback_points_used.toLocaleString()} benchmark fallback point(s) were used.`] : [])
  ].slice(0, 5);

  return {
    thesis,
    market_read: marketRead,
    action_bias: actionBias,
    confidence: dataConfidence,
    key_metrics: [
      {
        label: "Spread",
        value: spread === null ? "N/A" : `${spread.toFixed(1)} bps`,
        tone: metricTone(spread, true),
        detail: percentile === null ? "No percentile available." : `${percentile.toFixed(0)}th percentile of available history.`
      },
      {
        label: "Liquidity",
        value: liquidity === null ? "N/A" : liquidity.toFixed(1),
        tone: metricTone(liquidity, true),
        detail: `${payload.signals.liquidity.trade_count.toLocaleString()} recent trade(s), ${payload.signals.liquidity.total_trade_amount.toLocaleString()} par.`
      },
      {
        label: "Top CUSIP",
        value: topCandidate?.cusip ?? "N/A",
        tone: topCandidate?.signal.includes("Wide") ? "positive" : "neutral",
        detail: topCandidate ? `${topCandidate.signal}; RV ${topCandidate.rv_score ?? "N/A"}.` : "No security candidate passed scoring."
      },
      {
        label: "Data Quality",
        value: dataAudit.overall_status,
        tone: dataAudit.overall_status === "pass" ? "positive" : dataAudit.overall_status === "review" ? "warning" : "negative",
        detail: `${benchmarkMatch.toFixed(1)}% benchmark match across ${dataHealth.model_ready_rows.toLocaleString()} model-ready rows.`
      }
    ],
    decision_points: [
      ...recommendation.drivers.slice(0, 3),
      ...curveShape.slice(0, 1).map((metric) => `${metric.metric}: ${metric.value ?? "N/A"} ${metric.unit}.`)
    ].slice(0, 4),
    next_steps: [
      topCandidate ? `Open ${topCandidate.cusip} drilldown and review trade path / side mix.` : "Run CUSIP screener after adding enough benchmarkable rows.",
      "Compare selected bucket against peer and all-issuer reference lines.",
      "Confirm benchmark source and any MMD fallback before external distribution.",
      "Export HTML report or chart bundle after analyst review."
    ],
    risk_flags: riskFlags.length ? riskFlags : ["No additional rule-based risk flags beyond standard screening caveats."]
  };
}

function latestSpreadByIssuer(spreadObs: SpreadObservation[], maturityBucket: string | null) {
  const latest = new Map<string, SpreadObservation>();
  for (const row of spreadObs) {
    if (!maturityBucket || row.maturity_bucket !== maturityBucket) {
      continue;
    }
    const current = latest.get(row.issuer);
    if (!current || row.trade_date > current.trade_date) {
      latest.set(row.issuer, row);
    }
  }
  return latest;
}

function buildChartReferenceLines(input: {
  trades: TradeRow[];
  spreadObs: SpreadObservation[];
  issuer: string;
  maturityBucket: string | null;
  payload?: NextsrPayload;
}): ChartReferenceLine[] {
  const { trades, spreadObs, issuer, maturityBucket, payload } = input;
  const latestByIssuer = latestSpreadByIssuer(spreadObs, maturityBucket);
  const issuerSector = mode(trades.filter((trade) => trade.issuer === issuer).map((trade) => trade.sector));
  const sectorByIssuer = new Map<string, string>();
  for (const trade of trades) {
    if (trade.issuer && trade.sector && !sectorByIssuer.has(trade.issuer)) {
      sectorByIssuer.set(trade.issuer, trade.sector);
    }
  }
  const values = Array.from(latestByIssuer.entries()).map(([rowIssuer, row]) => ({
    issuer: rowIssuer,
    sector: sectorByIssuer.get(rowIssuer) ?? "Unknown",
    spread: row.spread_to_benchmark_bps
  }));
  const sectorLabel = issuerSector && issuerSector !== "Unknown" ? issuerSector : "Sector";
  const current = payload?.signals.spread.current_spread_bps ?? latestByIssuer.get(issuer)?.spread_to_benchmark_bps ?? null;
  const allAverage = values.length ? values.reduce((sum, row) => sum + row.spread, 0) / values.length : null;
  const sectorValues = values.filter((row) => row.sector === issuerSector);
  const sectorAverage = sectorValues.length ? sectorValues.reduce((sum, row) => sum + row.spread, 0) / sectorValues.length : null;
  const peerMedian = median(values.filter((row) => row.issuer !== issuer).map((row) => row.spread));
  const lines = [
    current === null
      ? null
      : {
          id: "selected-current",
          label: "Selected Current",
          value_bps: roundOrNull(current, 2) ?? current,
          source: "Selected issuer / bucket",
          description: "Current spread for the selected issuer and maturity bucket.",
          tone: "current" as const
        },
    sectorAverage === null
      ? null
      : {
          id: "sector-average",
          label: `${sectorLabel} Avg`,
          value_bps: roundOrNull(sectorAverage, 2) ?? sectorAverage,
          source: "Uploaded issuers with matching sector",
          description: `${sectorValues.length.toLocaleString()} latest same-bucket issuer observation(s).`,
          tone: "sector" as const
        },
    allAverage === null
      ? null
      : {
          id: "all-issuer-average",
          label: "All Issuer Avg",
          value_bps: roundOrNull(allAverage, 2) ?? allAverage,
          source: "Uploaded universe",
          description: `${values.length.toLocaleString()} latest same-bucket issuer observation(s).`,
          tone: "market" as const
        },
    peerMedian === null
      ? null
      : {
          id: "peer-median",
          label: "Peer Median",
          value_bps: roundOrNull(peerMedian, 2) ?? peerMedian,
          source: "Uploaded peers excluding selected issuer",
          description: "Median latest spread across other issuers in the selected bucket.",
          tone: "peer" as const
        },
    {
      id: "aaa-baseline",
      label: "AAA / Benchmark",
      value_bps: 0,
      source: "Benchmark spread baseline",
      description: "Zero spread to active benchmark, used as the baseline reference.",
      tone: "baseline" as const
    }
  ];
  return lines.filter((line): line is ChartReferenceLine => line !== null);
}

function buildCommentaryStudio(input: {
  payload: NextsrPayload;
  dataHealth: DataHealth;
  dataAudit: DataAuditCenter;
  benchmarkGovernance: BenchmarkGovernance;
  recommendation: RecommendationNarrative;
  deskSnapshot: DeskSnapshot;
  referenceLines: ChartReferenceLine[];
  candidates: SecurityCandidate[];
}): CommentaryStudio {
  const { payload, dataHealth, dataAudit, benchmarkGovernance, recommendation, deskSnapshot, referenceLines, candidates } = input;
  const topCandidate = candidates[0];
  const context: CommentaryStudio["market_context"] = [
    {
      step: "Retrieve uploaded market tape",
      status: dataHealth.model_ready_rows ? "ready" : "missing",
      evidence: `${dataHealth.model_ready_rows.toLocaleString()} model-ready trades across ${dataHealth.cusips.toLocaleString()} CUSIPs.`
    },
    {
      step: "Retrieve benchmark context",
      status: benchmarkGovernance.active_source ? "ready" : "missing",
      evidence: `${benchmarkGovernance.active_source ?? "No active benchmark"}; ${dataAudit.reconciliation.benchmark_match_rate_pct.toFixed(1)}% benchmark match.`
    },
    {
      step: "Retrieve relative-value context",
      status: referenceLines.length > 1 ? "ready" : "review",
      evidence: `${referenceLines.length.toLocaleString()} spread reference line(s) available for ${payload.maturity_bucket ?? "selected bucket"}.`
    },
    {
      step: "Retrieve CUSIP opportunity context",
      status: topCandidate ? "ready" : "review",
      evidence: topCandidate ? `${topCandidate.cusip} leads screener with ${topCandidate.signal}.` : "No scored CUSIP leads are available."
    }
  ];
  const review: CommentaryStudio["analyst_review"] = [
    {
      check: "Data readiness",
      status: dataAudit.overall_status === "pass" ? "pass" : dataAudit.overall_status,
      notes: `${dataAudit.reconciliation.model_ready_rows.toLocaleString()} model-ready rows; ${dataAudit.reconciliation.duplicate_rows_removed.toLocaleString()} duplicate row(s) removed.`
    },
    {
      check: "Benchmark governance",
      status: benchmarkGovernance.active_source ? "pass" : "blocked",
      notes: benchmarkGovernance.policy
    },
    {
      check: "Liquidity sufficiency",
      status: payload.signals.liquidity.trade_count >= 5 ? "pass" : payload.signals.liquidity.trade_count >= 2 ? "review" : "blocked",
      notes: `${payload.signals.liquidity.trade_count.toLocaleString()} recent trade(s); liquidity score ${payload.signals.liquidity.liquidity_score ?? "N/A"}.`
    },
    {
      check: "Distribution caveats",
      status: recommendation.caveats.length ? "review" : "pass",
      notes: recommendation.caveats.join(" ")
    }
  ];
  const bullets = [
    deskSnapshot.thesis,
    deskSnapshot.market_read,
    ...recommendation.drivers.slice(0, 3)
  ].slice(0, 5);
  return {
    market_context: context,
    analyst_review: review,
    generated_commentary: {
      headline: `${payload.issuer ?? "Issuer"} ${payload.maturity_bucket ?? "bucket"}: ${payload.label}`,
      bullets,
      client_note: `${recommendation.summary} Key support comes from ${recommendation.drivers.slice(0, 2).join(" ") || "the uploaded trade tape and benchmark governance checks."}`,
      internal_note: `${deskSnapshot.action_bias} Confidence: ${deskSnapshot.confidence}. Confirm all review checks before sending externally.`
    }
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(value: unknown): string {
  return JSON.stringify(value ?? "");
}

function rowsToCsv<T>(headers: string[], rows: T[], value: (row: T, header: string) => unknown): string {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(value(row, header))).join(","))
  ].join("\n");
}

function buildSecurityDetailCsv(details: SecurityDetail[]): string {
  const headers = ["cusip", "issuer", "signal", "maturity_bucket", "latest_trade_date", "spread_to_benchmark_bps", "liquidity_score", "rv_score", "trade_count", "total_trade_amount", "avg_yield", "latest_price"];
  return rowsToCsv(headers, details, (row, header) => row[header as keyof SecurityDetail]);
}

function buildBenchmarkCsv(rows: BenchmarkAuditRow[]): string {
  const headers = ["date", "tenor", "benchmark_yield", "benchmark_source", "observation_count"];
  return rowsToCsv(headers, rows, (row, header) => row[header as keyof BenchmarkAuditRow]);
}

function buildHtmlReport(
  payload: NextsrPayload,
  dataHealth: DataHealth,
  recommendation: RecommendationNarrative,
  candidates: SecurityCandidate[],
  curveShape: CurveShapeMetric[],
  dataAudit: DataAuditCenter,
  benchmarkGovernance: BenchmarkGovernance,
  deskSnapshot: DeskSnapshot,
  referenceLines: ChartReferenceLine[]
) {
  const candidateRows = candidates
    .slice(0, 15)
    .map((candidate) => `<tr><td>${escapeHtml(candidate.cusip)}</td><td>${escapeHtml(candidate.signal)}</td><td>${escapeHtml(candidate.maturity_bucket)}</td><td>${escapeHtml(candidate.spread_to_benchmark_bps ?? "N/A")}</td><td>${escapeHtml(candidate.liquidity_score ?? "N/A")}</td><td>${escapeHtml(candidate.rv_score ?? "N/A")}</td></tr>`)
    .join("");
  const driverRows = recommendation.drivers.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const caveatRows = recommendation.caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const curveRows = curveShape.map((metric) => `<li>${escapeHtml(metric.metric)}: ${escapeHtml(metric.value ?? "N/A")} ${escapeHtml(metric.unit)}. ${escapeHtml(metric.readthrough)}</li>`).join("");
  const auditRows = dataAudit.steps.map((step) => `<tr><td>${escapeHtml(step.step)}</td><td>${escapeHtml(step.status)}</td><td>${escapeHtml(step.rows_in.toLocaleString())}</td><td>${escapeHtml(step.rows_out.toLocaleString())}</td><td>${escapeHtml(step.rejected_rows.toLocaleString())}</td><td>${escapeHtml(step.notes.join(" "))}</td></tr>`).join("");
  const benchmarkRows = benchmarkGovernance.source_priority.map((source) => `<tr><td>${escapeHtml(source.source)}</td><td>${escapeHtml(source.status)}</td><td>${escapeHtml(source.points.toLocaleString())}</td><td>${escapeHtml(source.notes)}</td></tr>`).join("");
  const snapshotRows = deskSnapshot.key_metrics.map((metric) => `<div class="card"><strong>${escapeHtml(metric.label)}</strong><br />${escapeHtml(metric.value)}<br /><span class="muted">${escapeHtml(metric.detail)}</span></div>`).join("");
  const decisionRows = deskSnapshot.decision_points.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const riskRows = deskSnapshot.risk_flags.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const referenceRows = referenceLines.map((line) => `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(line.value_bps)} bps</td><td>${escapeHtml(line.source)}</td><td>${escapeHtml(line.description)}</td></tr>`).join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.issuer)} Secondary Market Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #18202a; margin: 32px; }
    h1 { margin-bottom: 4px; }
    .muted { color: #697586; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #d9e1ec; border-radius: 8px; padding: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border-bottom: 1px solid #d9e1ec; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.issuer)} Secondary Market Report</h1>
  <div class="muted">As of ${escapeHtml(payload.as_of_date ?? "N/A")} · ${escapeHtml(payload.maturity_bucket ?? "N/A")} · ${escapeHtml(dataHealth.benchmark_source ?? "No benchmark")}</div>
  <div class="grid">
    <div class="card"><strong>Signal</strong><br />${escapeHtml(payload.label)}</div>
    <div class="card"><strong>Spread</strong><br />${escapeHtml(payload.signals.spread.current_spread_bps ?? "N/A")} bps</div>
    <div class="card"><strong>Liquidity</strong><br />${escapeHtml(payload.signals.liquidity.liquidity_score ?? "N/A")}</div>
    <div class="card"><strong>Universe</strong><br />${escapeHtml(dataHealth.model_ready_rows.toLocaleString())} trades</div>
  </div>
  <h2>Desk Snapshot</h2>
  <p><strong>${escapeHtml(deskSnapshot.confidence)} confidence.</strong> ${escapeHtml(deskSnapshot.thesis)}</p>
  <p>${escapeHtml(deskSnapshot.market_read)}</p>
  <p>${escapeHtml(deskSnapshot.action_bias)}</p>
  <div class="grid">${snapshotRows}</div>
  <h3>Decision Points</h3><ul>${decisionRows}</ul>
  <h3>Risk Flags</h3><ul>${riskRows}</ul>
  <h2>Recommendation Narrative</h2>
  <p>${escapeHtml(recommendation.summary)}</p>
  <h3>Drivers</h3><ul>${driverRows}</ul>
  <h3>Caveats</h3><ul>${caveatRows}</ul>
  <h2>Spread Reference Lines</h2>
  <table><thead><tr><th>Reference</th><th>Spread</th><th>Source</th><th>Description</th></tr></thead><tbody>${referenceRows}</tbody></table>
  <h2>Data Audit Center</h2>
  <p>Status: <strong>${escapeHtml(dataAudit.overall_status)}</strong>. Benchmark match rate: ${escapeHtml(dataAudit.reconciliation.benchmark_match_rate_pct)}%.</p>
  <table><thead><tr><th>Step</th><th>Status</th><th>Rows In</th><th>Rows Out</th><th>Rejected</th><th>Notes</th></tr></thead><tbody>${auditRows}</tbody></table>
  <h2>Benchmark Governance</h2>
  <p>${escapeHtml(benchmarkGovernance.policy)}</p>
  <table><thead><tr><th>Source</th><th>Status</th><th>Points</th><th>Notes</th></tr></thead><tbody>${benchmarkRows}</tbody></table>
  <h2>Top Security Candidates</h2>
  <table><thead><tr><th>CUSIP</th><th>Signal</th><th>Bucket</th><th>Spread</th><th>Liquidity</th><th>RV</th></tr></thead><tbody>${candidateRows}</tbody></table>
  <h2>Curve Shape</h2><ul>${curveRows}</ul>
</body>
</html>`;
}

function buildPptOutlineMarkdown(input: {
  payload: NextsrPayload;
  deskSnapshot: DeskSnapshot;
  recommendation: RecommendationNarrative;
  referenceLines: ChartReferenceLine[];
  candidates: SecurityCandidate[];
  curveShape: CurveShapeMetric[];
}) {
  const { payload, deskSnapshot, recommendation, referenceLines, candidates, curveShape } = input;
  const topCandidates = candidates.slice(0, 6).map((candidate) => `  - ${candidate.cusip}: ${candidate.signal}; spread ${candidate.spread_to_benchmark_bps ?? "N/A"} bps; liquidity ${candidate.liquidity_score ?? "N/A"}`).join("\n");
  const referenceBullets = referenceLines.map((line) => `  - ${line.label}: ${line.value_bps} bps (${line.source})`).join("\n");
  const curveBullets = curveShape.map((metric) => `  - ${metric.metric}: ${metric.value ?? "N/A"} ${metric.unit}; ${metric.readthrough}`).join("\n");
  return [
    `# ${payload.issuer ?? "Issuer"} Secondary Market Deck Outline`,
    "",
    "## Slide 1 - Desk Snapshot",
    `- ${deskSnapshot.thesis}`,
    `- ${deskSnapshot.market_read}`,
    `- Action bias: ${deskSnapshot.action_bias}`,
    `- Confidence: ${deskSnapshot.confidence}`,
    "",
    "## Slide 2 - Key Metrics",
    ...deskSnapshot.key_metrics.map((metric) => `- ${metric.label}: ${metric.value}. ${metric.detail}`),
    "",
    "## Slide 3 - Spread Trend Reference Lines",
    referenceBullets || "  - No reference lines available.",
    "",
    "## Slide 4 - Security Candidates",
    topCandidates || "  - No CUSIP candidates available.",
    "",
    "## Slide 5 - Recommendation Narrative",
    ...recommendation.drivers.slice(0, 5).map((item) => `- ${item}`),
    "",
    "## Slide 6 - Risk Flags / Caveats",
    ...deskSnapshot.risk_flags.slice(0, 5).map((item) => `- ${item}`),
    "",
    "## Slide 7 - Curve Shape / Scenario Discussion",
    curveBullets || "  - No curve-shape metrics available."
  ].join("\n");
}

function buildReportManifest(input: {
  payload: NextsrPayload;
  dataHealth: DataHealth;
  deskSnapshot: DeskSnapshot;
  referenceLines: ChartReferenceLine[];
  commentaryStudio: CommentaryStudio;
  parityAudit: StreamlitParityAuditItem[];
}) {
  const parityCounts = input.parityAudit.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
  return JSON.stringify({
    report_type: "secondary_market_analysis_bundle",
    issuer: input.payload.issuer,
    maturity_bucket: input.payload.maturity_bucket,
    as_of_date: input.payload.as_of_date,
    confidence: input.deskSnapshot.confidence,
    included_exports: [
      "nextsr_payload.json",
      "secondary_market_summary.md",
      "secondary_market_report.html",
      "chart_data_bundle.json",
      "audit_data_bundle.json",
      "security_screener.csv",
      "security_detail.csv",
      "benchmark_audit.csv",
      "ppt_outline.md"
    ],
    data_health: {
      model_ready_rows: input.dataHealth.model_ready_rows,
      cusips: input.dataHealth.cusips,
      benchmark_source: input.dataHealth.benchmark_source
    },
    reference_lines: input.referenceLines,
    streamlit_parity_counts: parityCounts,
    commentary_review: input.commentaryStudio.analyst_review
  }, null, 2);
}

function buildMethodologySections(): MethodologySection[] {
  return [
    {
      title: "Benchmark Source Governance",
      body: "Trade Sheet Index / Index Rate is used first because it is tied to the same trade tape. Uploaded MMD is used only when trade-index benchmark data is unavailable."
    },
    {
      title: "Security Screener",
      body: "CUSIP-level scores combine spread-to-benchmark, liquidity percentile, trade count, par amount, and recency. Scores are relative screening signals."
    },
    {
      title: "Liquidity",
      body: "Liquidity score blends recent trade count, total par traded, and days since latest trade. It does not represent executable depth."
    },
    {
      title: "Scenario Shock",
      body: "Price impact uses a transparent maturity-based duration proxy. It is intended for quick screening, not full risk-model valuation."
    },
    {
      title: "AI Commentary",
      body: "The AI context package is structured from calculated dashboard evidence. Live AI generation should be enabled only after API-key and data-governance settings are configured."
    }
  ];
}

function buildReportArtifacts(input: {
  payload: NextsrPayload;
  dataHealth: DataHealth;
  dataAudit: DataAuditCenter;
  dataQualityScorecard: DataQualityScorecard;
  benchmarkGovernance: BenchmarkGovernance;
  recommendation: RecommendationNarrative;
  deskSnapshot: DeskSnapshot;
  referenceLines: ChartReferenceLine[];
  commentaryStudio: CommentaryStudio;
  parityAudit: StreamlitParityAuditItem[];
  candidates: SecurityCandidate[];
  securityDetails: SecurityDetail[];
  benchmarkAudit: BenchmarkAuditRow[];
  curveShape: CurveShapeMetric[];
  dashboardData: Record<string, unknown>;
}): ReportArtifacts {
  return {
    html_report: buildHtmlReport(input.payload, input.dataHealth, input.recommendation, input.candidates, input.curveShape, input.dataAudit, input.benchmarkGovernance, input.deskSnapshot, input.referenceLines),
    chart_data_json: JSON.stringify(input.dashboardData, null, 2),
    audit_data_json: JSON.stringify({
      data_health: input.dataHealth,
      data_audit_center: input.dataAudit,
      data_quality_scorecard: input.dataQualityScorecard,
      benchmark_governance: input.benchmarkGovernance
    }, null, 2),
    security_detail_csv: buildSecurityDetailCsv(input.securityDetails),
    benchmark_csv: buildBenchmarkCsv(input.benchmarkAudit),
    ppt_outline_markdown: buildPptOutlineMarkdown({
      payload: input.payload,
      deskSnapshot: input.deskSnapshot,
      recommendation: input.recommendation,
      referenceLines: input.referenceLines,
      candidates: input.candidates,
      curveShape: input.curveShape
    }),
    report_manifest_json: buildReportManifest({
      payload: input.payload,
      dataHealth: input.dataHealth,
      deskSnapshot: input.deskSnapshot,
      referenceLines: input.referenceLines,
      commentaryStudio: input.commentaryStudio,
      parityAudit: input.parityAudit
    })
  };
}

function buildExportSummary(payload: NextsrPayload, dataHealth: DataHealth, candidates: SecurityCandidate[], curveShape: CurveShapeMetric[]) {
  const lines = [
    `# ${payload.issuer ?? "Unknown"} Secondary Market Summary`,
    "",
    `- As of: ${payload.as_of_date ?? "N/A"}`,
    `- Maturity bucket: ${payload.maturity_bucket ?? "N/A"}`,
    `- Signal: ${payload.label}`,
    `- Current spread: ${payload.signals.spread.current_spread_bps ?? "N/A"} bps`,
    `- Liquidity score: ${payload.signals.liquidity.liquidity_score ?? "N/A"}`,
    `- Uploaded universe: ${dataHealth.model_ready_rows.toLocaleString()} model-ready trades across ${dataHealth.cusips.toLocaleString()} CUSIPs`,
    `- Benchmark source: ${dataHealth.benchmark_source ?? "Unavailable"}`,
    "",
    "## Top Security Candidates",
    ...candidates.slice(0, 5).map((candidate) => `- ${candidate.cusip}: ${candidate.signal}; spread ${candidate.spread_to_benchmark_bps ?? "N/A"} bps; liquidity ${candidate.liquidity_score ?? "N/A"}`),
    "",
    "## Curve Shape",
    ...curveShape.map((metric) => `- ${metric.metric}: ${metric.value ?? "N/A"} ${metric.unit}. ${metric.readthrough}`)
  ];
  return lines.join("\n");
}

function buildStreamlitParityAudit(): StreamlitParityAuditItem[] {
  return [
    {
      area: "Data Intake / Governance",
      streamlit_surface: "File Readiness Check",
      source_anchor: "file-readiness",
      next_surface: "File Readiness Check + detected-field validation",
      status: "ported",
      priority: "High",
      notes: "Multi-file trade upload, required/recommended field detection, readiness status, and safe missing-field handling are implemented.",
      next_step: "Keep testing additional vendor export formats."
    },
    {
      area: "Data Intake / Governance",
      streamlit_surface: "Bond / Issuer / MMD optional reference files",
      source_anchor: "sidebar optional reference files",
      next_surface: "Optional Reference Files expander",
      status: "ported",
      priority: "High",
      notes: "Bond reference, issuer mapping, MMD benchmark uploads, manual sector override, and template examples are supported in the Next API/UI.",
      next_step: "Persist issuer-sector defaults if a backend datastore is introduced."
    },
    {
      area: "Data Intake / Governance",
      streamlit_surface: "Download blank templates",
      source_anchor: "sidebar download blank templates",
      next_surface: "Template downloads in Optional Reference Files",
      status: "ported",
      priority: "Medium",
      notes: "Blank trade, bond reference, issuer mapping, and MMD benchmark CSV templates are downloadable from the input panel.",
      next_step: "Add richer sample workbooks if users need Excel-formatted templates."
    },
    {
      area: "Data Intake / Governance",
      streamlit_surface: "Performance controls / clear cached calculations",
      source_anchor: "sidebar performance",
      next_surface: "Performance / Workspace controls",
      status: "ported",
      priority: "Low",
      notes: "Next exposes upload limits, display mode, diagnostics toggle, table density, row limits, and reset-workspace controls.",
      next_step: "Add server-side caching only if uploads grow beyond Vercel synchronous limits."
    },
    {
      area: "Data Intake / Governance",
      streamlit_surface: "Benchmark source governance",
      source_anchor: "benchmark source governance",
      next_surface: "Benchmark Governance + Benchmark Audit",
      status: "partial",
      priority: "High",
      notes: "Trade Index / Index Rate first and MMD fallback are implemented; Streamlit's rating-curve selector and richer assumption tables are not fully replicated.",
      next_step: "Add AAA/AA/A/BBB curve selector and explicit benchmark override controls."
    },
    {
      area: "Data Intake / Governance",
      streamlit_surface: "Data Quality Scorecard",
      source_anchor: "data-quality-scorecard",
      next_surface: "Data Quality Scorecard + Data Audit Center",
      status: "ported",
      priority: "High",
      notes: "Weighted score tiles now cover required fields, maturity quality, amount coverage, benchmark match, CUSIP reference match, and issuer mapping match.",
      next_step: "Tune score weights after more desk-approved sample files are reviewed."
    },
    {
      area: "Executive / Navigation",
      streamlit_surface: "Executive Snapshot / Desk Market Snapshot",
      source_anchor: "executive-snapshot / desk-market-snapshot",
      next_surface: "Desk Snapshot",
      status: "next-enhanced",
      priority: "High",
      notes: "Next now opens with thesis, market read, action bias, confidence, decision points, next steps, and risk flags.",
      next_step: "Tune language against real desk examples after more issuer files are tested."
    },
    {
      area: "Executive / Navigation",
      streamlit_surface: "Sidebar desk navigation / contents",
      source_anchor: "dashboard-contents / sidebar-nav-small",
      next_surface: "Sticky workflow rail",
      status: "ported",
      priority: "High",
      notes: "Top rail now follows Intake, Snapshot, Audit, Charts, CUSIPs, and Export / Parity, with downloads moved out of the first output view.",
      next_step: "Revisit naming after user testing with real analyst workflows."
    },
    {
      area: "Benchmark / Spread Framework",
      streamlit_surface: "Yield Trend / Relative Value Comparison",
      source_anchor: "yield-relative-value",
      next_surface: "Spread Trend + reference lines",
      status: "partial",
      priority: "High",
      notes: "Selected-bucket spread trend, brush zoom, crosshair, and reference lines exist; full multi-rating yield/RV comparison controls are not complete.",
      next_step: "Add rating curve selector and multi-issuer overlay controls."
    },
    {
      area: "Benchmark / Spread Framework",
      streamlit_surface: "Issuer Curve vs Benchmark Curve",
      source_anchor: "issuer-curve",
      next_surface: "Issuer Curve vs Benchmark",
      status: "ported",
      priority: "High",
      notes: "Issuer/benchmark yield curve, spread-curve mode, legend toggle, brush zoom, crosshair, and bucket selection are implemented.",
      next_step: "Add multi-rating benchmark overlays after the rating policy is finalized."
    },
    {
      area: "Benchmark / Spread Framework",
      streamlit_surface: "Current Spread Level Framework",
      source_anchor: "spread-level",
      next_surface: "Spread Trend reference lines + Spread Movement Ladder",
      status: "partial",
      priority: "High",
      notes: "Baseline/current/sector/all-issuer references, movement ladder, and current spread heatmap by maturity bucket are implemented; rating ladder controls are still partial.",
      next_step: "Add benchmark-rating selector once rating-specific curve governance is approved."
    },
    {
      area: "Benchmark / Spread Framework",
      streamlit_surface: "Spread Attribution Waterfall",
      source_anchor: "spread-attribution",
      next_surface: "Spread Attribution Waterfall",
      status: "partial",
      priority: "Medium",
      notes: "A simplified attribution bridge exists; Streamlit's rating, liquidity, callable adjustment, and residual decomposition is richer.",
      next_step: "Separate rating premium, liquidity premium, callable proxy, and residual components."
    },
    {
      area: "Relative Value Signals",
      streamlit_surface: "Peer Relative Value Comparison",
      source_anchor: "peer-rv",
      next_surface: "Peer Relative Value",
      status: "partial",
      priority: "High",
      notes: "Peer gap by bucket, peer gap bar chart, and peer ranking table are implemented; peer curve matrix is still partial.",
      next_step: "Add peer curve matrix with issuer selection controls."
    },
    {
      area: "Relative Value Signals",
      streamlit_surface: "Cross-Issuer Relative Value Analytics",
      source_anchor: "cross-issuer-rv",
      next_surface: "Cross-Issuer RV Ranking",
      status: "partial",
      priority: "High",
      notes: "Cross-issuer ranking, opportunity map, and decision table action labels are implemented; full peer gap matrix remains partial.",
      next_step: "Add issuer-by-issuer peer gap matrix."
    },
    {
      area: "Relative Value Signals",
      streamlit_surface: "Historical Spread Range & Percentile",
      source_anchor: "historical-spread",
      next_surface: "Historical Spread Range",
      status: "partial",
      priority: "Medium",
      notes: "Current/median/percentile table and percentile chart exist; raw/rolling window controls are still partial.",
      next_step: "Add rolling-window selector and full raw spread distribution view."
    },
    {
      area: "Relative Value Signals",
      streamlit_surface: "Curve Shape Analytics",
      source_anchor: "curve-shape",
      next_surface: "Curve Shape Analytics",
      status: "partial",
      priority: "Medium",
      notes: "Slope/butterfly diagnostics, curve-shape bar chart, and issuer curve yield/spread basis toggle exist; richer curve decomposition is partial.",
      next_step: "Add historical curve-shape trend and richer read-through rules."
    },
    {
      area: "Relative Value Signals",
      streamlit_surface: "Market Narrative & Opportunity Map",
      source_anchor: "market-narrative",
      next_surface: "Desk Snapshot + AI Commentary Studio + RV Positioning",
      status: "partial",
      priority: "Medium",
      notes: "Narrative, opportunity positioning, and rich/cheap quadrant opportunity map exist; explicit trading timeline tabs are still partial.",
      next_step: "Add trading activity timeline with selectable event buckets."
    },
    {
      area: "CUSIP Workflow",
      streamlit_surface: "Security Screener - Top Relative Value Candidates",
      source_anchor: "security-screener",
      next_surface: "Security Screener",
      status: "ported",
      priority: "High",
      notes: "CUSIP score, filters, sorting, table controls, opportunity read-through card, drilldown link, and CSV export are implemented.",
      next_step: "Tune signal language against desk-approved examples."
    },
    {
      area: "CUSIP Workflow",
      streamlit_surface: "CUSIP Opportunity Drilldown",
      source_anchor: "cusip-drilldown",
      next_surface: "CUSIP Opportunity Drilldown",
      status: "partial",
      priority: "High",
      notes: "Security detail, trade path, yield history, par amount history, benchmark audit, read-through, comparable CUSIPs, and latest trades exist; rating drilldown controls remain partial.",
      next_step: "Add rating-specific drilldown controls when rating curve governance is finalized."
    },
    {
      area: "CUSIP Workflow",
      streamlit_surface: "Relative Value Positioning Map",
      source_anchor: "rv-positioning",
      next_surface: "RV Positioning Map",
      status: "ported",
      priority: "High",
      notes: "Liquidity-vs-spread/yield bubble map with selected CUSIP interaction and y-axis toggle is implemented.",
      next_step: "Add issuer comparison selection if multi-issuer positioning becomes a core workflow."
    },
    {
      area: "CUSIP Workflow",
      streamlit_surface: "Watchlist / Saved Candidates",
      source_anchor: "watchlist",
      next_surface: "Watchlist / Saved Candidates",
      status: "ported",
      priority: "Medium",
      notes: "Client-side local watchlist with add/remove/clear/export is implemented.",
      next_step: "Add project-level saved watchlists if a backend datastore is introduced."
    },
    {
      area: "Risk / Liquidity",
      streamlit_surface: "Liquidity / Trading Frequency Analysis",
      source_anchor: "liquidity",
      next_surface: "Monthly Activity + Liquidity by Bucket",
      status: "ported",
      priority: "Medium",
      notes: "Monthly activity, bucket liquidity, trade frequency, trade-size distribution, staleness histogram, and top CUSIP activity are implemented.",
      next_step: "Add liquidity trend overlays if users need time-series liquidity scoring."
    },
    {
      area: "Risk / Liquidity",
      streamlit_surface: "Bid / Ask & Dealer Behavior Proxy",
      source_anchor: "dealer-proxy",
      next_surface: "Bid / Ask & Dealer Behavior Proxy",
      status: "ported",
      priority: "Medium",
      notes: "Buy/sell/other flow proxy is implemented from trade side classifications.",
      next_step: "Add bid/ask proxy trend over time."
    },
    {
      area: "Risk / Liquidity",
      streamlit_surface: "Scenario Shock Analysis",
      source_anchor: "scenario-shock",
      next_surface: "Scenario Shock Analysis",
      status: "partial",
      priority: "Medium",
      notes: "Bucket-level impact and custom uniform shock control are implemented; custom short/10Y/20Y/30Y curve shocks and CUSIP exposure map remain partial.",
      next_step: "Add tenor-specific shock curve controls and CUSIP exposure map."
    },
    {
      area: "Risk / Liquidity",
      streamlit_surface: "Spread Movement Heatmap / Ladder",
      source_anchor: "spread-movement",
      next_surface: "Spread Movement Ladder",
      status: "partial",
      priority: "Medium",
      notes: "Movement ladder and current-spread heatmap are implemented; rating selector remains partial.",
      next_step: "Add rating/tenor controls once benchmark rating policy is finalized."
    },
    {
      area: "AI / Narrative",
      streamlit_surface: "Trade Recommendation Narrative Engine",
      source_anchor: "recommendation-engine",
      next_surface: "Recommendation Narrative + Desk Snapshot",
      status: "ported",
      priority: "High",
      notes: "Rule-based recommendation label, drivers, caveats, and generated commentary exist.",
      next_step: "Tune thresholds using historical desk examples."
    },
    {
      area: "AI / Narrative",
      streamlit_surface: "AI Commentary Studio",
      source_anchor: "ai-commentary-studio",
      next_surface: "AI Commentary Studio",
      status: "partial",
      priority: "High",
      notes: "Retrieve/review/generate workflow exists with structured evidence; live OpenAI generation and external market retrieval are intentionally not connected yet.",
      next_step: "Add governed AI endpoint, model selector, and source citation controls."
    },
    {
      area: "Export / Admin",
      streamlit_surface: "Report Export Center",
      source_anchor: "report-export-center",
      next_surface: "Report Export Center",
      status: "partial",
      priority: "High",
      notes: "HTML, JSON, CSV, markdown, chart bundle, manifest, and PPT outline exports exist; native PDF/PPTX binary generation is not yet implemented.",
      next_step: "Add server-side PDF/PPTX generation or a queued export worker."
    },
    {
      area: "Export / Admin",
      streamlit_surface: "Export Summary Package",
      source_anchor: "export-summary",
      next_surface: "Summary MD + report manifest",
      status: "ported",
      priority: "Medium",
      notes: "Summary markdown and report manifest are implemented.",
      next_step: "Add one-click zip bundle when deployment limits allow it."
    },
    {
      area: "Export / Admin",
      streamlit_surface: "Security Reference / Trade Detail / Raw Tables",
      source_anchor: "bond-master / trade-detail / downloads",
      next_surface: "Security Detail CSV + Benchmark CSV + Developer Payload",
      status: "partial",
      priority: "Medium",
      notes: "Selected detail exports, benchmark CSV, developer payload, and diagnostics table browser exist; full merged-market raw downloads remain partial.",
      next_step: "Add processed merged-market CSV export if file size remains Vercel-safe."
    },
    {
      area: "Export / Admin",
      streamlit_surface: "Admin Methodology Page / Version Change Log",
      source_anchor: "admin-methodology / version-changelog",
      next_surface: "Admin / Benchmark Policy + Module Status",
      status: "partial",
      priority: "Low",
      notes: "Methodology blocks, benchmark assumption table, module status, and version changelog are implemented; full Streamlit expander copy is still partial.",
      next_step: "Backfill any remaining Streamlit methodology prose after final product wording is approved."
    }
  ];
}

function emptyDashboard(): DashboardAnalytics {
  return {
    file_readiness: [],
    data_health: {
      trade_files: 0,
      trade_rows_raw: 0,
      model_ready_rows: 0,
      duplicate_rows_removed: 0,
      issuers: 0,
      cusips: 0,
      first_trade_date: null,
      latest_trade_date: null,
      benchmark_source: null,
      reference_files: { bond_reference: false, issuer_mapping: false, uploaded_mmd: false }
    },
    data_audit_center: {
      overall_status: "blocked",
      steps: [],
      field_coverage: [],
      reconciliation: {
        raw_rows: 0,
        model_ready_rows: 0,
        duplicate_rows_removed: 0,
        unmatched_benchmark_rows: 0,
        benchmark_match_rate_pct: 0,
        cusip_reference_match_rate_pct: null,
        issuer_mapping_match_rate_pct: null
      },
      warnings: []
    },
    data_quality_scorecard: {
      overall_score: null,
      status: "blocked",
      metrics: []
    },
    benchmark_governance: {
      active_source: null,
      policy: "Trade Sheet Index / Index Rate first; uploaded MMD is fallback when trade index is unavailable.",
      trade_index_points: 0,
      uploaded_mmd_points: 0,
      active_points: 0,
      fallback_points_used: 0,
      missing_active_tenors: [],
      rating_curve_selector: "General market curve",
      spread_assumptions: [],
      source_priority: []
    },
    issuers: [],
    issuer_curve: [],
    spread_trend: [],
    linked_spread_trends: {},
    monthly_activity: [],
    positioning: [],
    spread_movement_ladder: [],
    liquidity: [],
    trade_size_distribution: [],
    staleness_distribution: [],
    top_cusip_activity: [],
    peer_rv: [],
    cross_issuer_rv: [],
    spread_attribution: [],
    historical_percentiles: [],
    curve_shape: [],
    scenario_shock: [],
    dealer_proxy: [],
    security_details: [],
    benchmark_audit: [],
    recommendation: {
      label: "Neutral / Needs More Evidence",
      summary: "No recommendation narrative is available until a dashboard payload is generated.",
      drivers: [],
      caveats: [],
      evidence: []
    },
    desk_snapshot: {
      thesis: "No desk snapshot is available until a dashboard payload is generated.",
      market_read: "Upload trade data and run the dashboard to generate a market read.",
      action_bias: "Waiting for model-ready trade data.",
      confidence: "Low",
      key_metrics: [],
      decision_points: [],
      next_steps: [],
      risk_flags: []
    },
    chart_reference_lines: [],
    commentary_studio: {
      market_context: [],
      analyst_review: [],
      generated_commentary: {
        headline: "No commentary generated.",
        bullets: [],
        client_note: "",
        internal_note: ""
      }
    },
    streamlit_parity_audit: buildStreamlitParityAudit(),
    methodology_sections: buildMethodologySections(),
    report_artifacts: {
      html_report: "",
      chart_data_json: "",
      audit_data_json: "",
      security_detail_csv: "",
      benchmark_csv: "",
      ppt_outline_markdown: "",
      report_manifest_json: ""
    },
    analyst_context: {},
    export_summary_markdown: "",
    admin: {
      methodology_version: "nextsr-parity.v3",
      benchmark_policy: "Trade Sheet Index / Index Rate first; uploaded MMD is fallback when trade index is unavailable.",
      module_status: [
        { module: "Data Engine", status: "ported", notes: "Multi-trade upload, optional bond reference, issuer mapping, sector override, MMD fallback, templates, quality scorecard, and merged trade universe." },
        { module: "Core Dashboard", status: "ported", notes: "Desk snapshot, spread trend, volume, issuer curve yield/spread mode, spread ladder, heatmap, liquidity, screener, RV positioning, CUSIP drilldown." },
        { module: "Advanced Analytics", status: "partial", notes: "Peer RV, cross-issuer RV, opportunity map, attribution, historical range, curve shape, scenario shock, and benchmark audit are implemented with transparent approximations where needed." },
        { module: "Watchlist / Drilldown", status: "ported", notes: "Client-side watchlist, selected CUSIP detail, trade path, and read-through are available." },
        { module: "AI / Export / Admin", status: "partial", notes: "Desk snapshot, commentary studio, markdown/HTML/chart-data exports, PPT outline, report manifest, and methodology metadata are available; live AI/PDF/PPTX services can be added after governance is set." }
      ]
    }
  };
}

function buildDashboardAnalytics(input: {
  trades: TradeRow[];
  benchmarkCurve: BenchmarkRow[];
  spreadObs: SpreadObservation[];
  securityScreener: SecurityCandidate[];
  readiness: FileReadinessReport[];
  dataHealth: DataHealth;
  dataAudit: DataAuditCenter;
  benchmarkGovernance: BenchmarkGovernance;
  issuer: string | null;
  maturityBucket: string | null;
  periodDays: number;
  payload?: NextsrPayload;
}): DashboardAnalytics {
  const dataQualityScorecard = buildDataQualityScorecard(input.dataAudit);
  if (!input.issuer) {
    return {
      ...emptyDashboard(),
      file_readiness: input.readiness,
      data_health: input.dataHealth,
      data_audit_center: input.dataAudit,
      data_quality_scorecard: dataQualityScorecard,
      benchmark_governance: input.benchmarkGovernance,
      issuers: buildIssuerOptions(input.trades)
    };
  }
  const issuerCurve = buildIssuerCurve(input.trades, input.benchmarkCurve, input.issuer, input.periodDays);
  const curveShape = buildCurveShape(issuerCurve);
  const payload = input.payload;
  const spreadAttribution = payload ? buildSpreadAttribution(payload, issuerCurve) : [];
  const spreadTrend = buildSpreadTrend(input.spreadObs, input.issuer, input.maturityBucket);
  const linkedSpreadTrends = Object.fromEntries(
    MATURITY_BUCKET_ORDER
      .map((bucket) => [bucket, buildSpreadTrend(input.spreadObs, input.issuer ?? "", bucket)] as const)
      .filter(([, points]) => points.length > 0)
  );
  const monthlyActivity = buildMonthlyActivity(input.trades, input.issuer);
  const spreadMovement = buildSpreadMovementLadder(input.spreadObs, input.issuer);
  const liquidity = buildLiquidityByBucket(input.trades, input.issuer, input.periodDays);
  const tradeSizeDistribution = buildTradeSizeDistribution(input.trades, input.issuer, input.periodDays);
  const stalenessDistribution = buildStalenessDistribution(input.securityScreener, input.issuer);
  const topCusipActivity = buildTopCusipActivity(input.securityScreener, input.issuer);
  const peerRv = buildPeerRv(input.spreadObs, input.issuer);
  const crossIssuerRv = buildCrossIssuerRv(input.trades, input.securityScreener);
  const historicalPercentiles = buildHistoricalPercentiles(input.spreadObs, input.issuer);
  const scenarioShock = buildScenarioShock(input.trades, input.issuer);
  const dealerProxy = buildDealerProxy(input.trades, input.issuer, input.periodDays);
  const securityDetails = buildSecurityDetails(input.trades, input.securityScreener, input.benchmarkCurve);
  const benchmarkAudit = buildBenchmarkAudit(input.benchmarkCurve);
  const recommendation = payload ? buildRecommendationNarrative(payload, input.securityScreener, peerRv) : emptyDashboard().recommendation;
  const parityAudit = buildStreamlitParityAudit();
  const deskSnapshot = payload
    ? buildDeskSnapshot({
        payload,
        dataHealth: input.dataHealth,
        dataAudit: input.dataAudit,
        benchmarkGovernance: input.benchmarkGovernance,
        recommendation,
        candidates: input.securityScreener,
        curveShape
      })
    : emptyDashboard().desk_snapshot;
  const chartReferenceLines = payload
    ? buildChartReferenceLines({
        trades: input.trades,
        spreadObs: input.spreadObs,
        issuer: input.issuer,
        maturityBucket: input.maturityBucket,
        payload
      })
    : [];
  const commentaryStudio = payload
    ? buildCommentaryStudio({
        payload,
        dataHealth: input.dataHealth,
        dataAudit: input.dataAudit,
        benchmarkGovernance: input.benchmarkGovernance,
        recommendation,
        deskSnapshot,
        referenceLines: chartReferenceLines,
        candidates: input.securityScreener
      })
    : emptyDashboard().commentary_studio;
  const compactDashboardData = {
    desk_snapshot: deskSnapshot,
    issuer_curve: issuerCurve,
    spread_trend: spreadTrend,
    chart_reference_lines: chartReferenceLines,
    monthly_activity: monthlyActivity,
    spread_movement_ladder: spreadMovement.slice(0, 50),
    liquidity,
    trade_size_distribution: tradeSizeDistribution,
    staleness_distribution: stalenessDistribution,
    top_cusip_activity: topCusipActivity,
    peer_rv: peerRv,
    cross_issuer_rv: crossIssuerRv.slice(0, 50),
    historical_percentiles: historicalPercentiles,
    scenario_shock: scenarioShock,
    dealer_proxy: dealerProxy,
    security_screener: input.securityScreener.slice(0, MAX_EXPORT_SCREENER_ROWS)
  };
  const reportArtifacts = payload
    ? buildReportArtifacts({
        payload,
        dataHealth: input.dataHealth,
        dataAudit: input.dataAudit,
        dataQualityScorecard,
        benchmarkGovernance: input.benchmarkGovernance,
        recommendation,
        deskSnapshot,
        referenceLines: chartReferenceLines,
        commentaryStudio,
        parityAudit,
        candidates: input.securityScreener,
        securityDetails,
        benchmarkAudit,
        curveShape,
        dashboardData: compactDashboardData
      })
    : emptyDashboard().report_artifacts;
  return {
    ...emptyDashboard(),
    file_readiness: input.readiness,
    data_health: input.dataHealth,
    data_audit_center: input.dataAudit,
    data_quality_scorecard: dataQualityScorecard,
    benchmark_governance: input.benchmarkGovernance,
    issuers: buildIssuerOptions(input.trades),
    issuer_curve: issuerCurve,
    spread_trend: spreadTrend,
    linked_spread_trends: linkedSpreadTrends,
    monthly_activity: monthlyActivity,
    positioning: input.securityScreener.slice(0, 80).map((candidate) => ({
      cusip: candidate.cusip,
      issuer: candidate.issuer,
      maturity_bucket: candidate.maturity_bucket,
      avg_yield: candidate.avg_yield,
      spread_bps: candidate.spread_to_benchmark_bps,
      liquidity_score: candidate.liquidity_score,
      rv_score: candidate.rv_score,
      trade_count: candidate.trade_count,
      total_trade_amount: candidate.total_trade_amount,
      signal: candidate.signal
    })),
    spread_movement_ladder: spreadMovement,
    liquidity,
    trade_size_distribution: tradeSizeDistribution,
    staleness_distribution: stalenessDistribution,
    top_cusip_activity: topCusipActivity,
    peer_rv: peerRv,
    cross_issuer_rv: crossIssuerRv,
    spread_attribution: spreadAttribution,
    historical_percentiles: historicalPercentiles,
    curve_shape: curveShape,
    scenario_shock: scenarioShock,
    dealer_proxy: dealerProxy,
    security_details: securityDetails,
    benchmark_audit: benchmarkAudit,
    recommendation,
    desk_snapshot: deskSnapshot,
    chart_reference_lines: chartReferenceLines,
    commentary_studio: commentaryStudio,
    streamlit_parity_audit: parityAudit,
    methodology_sections: buildMethodologySections(),
    report_artifacts: reportArtifacts,
    analyst_context: {
      issuer: input.issuer,
      maturity_bucket: input.maturityBucket,
      data_health: input.dataHealth,
      data_audit_center: input.dataAudit,
      benchmark_governance: input.benchmarkGovernance,
      payload_signals: payload?.signals ?? null,
      top_candidates: input.securityScreener.slice(0, 10),
      recommendation,
      desk_snapshot: deskSnapshot,
      chart_reference_lines: chartReferenceLines,
      commentary_studio: commentaryStudio,
      selected_security: securityDetails[0] ?? null,
      benchmark_audit: benchmarkAudit.slice(0, 20)
    },
    export_summary_markdown: payload ? buildExportSummary(payload, input.dataHealth, input.securityScreener, curveShape) : ""
  };
}

function buildPreparedResult(input: {
  rows: RawRow[];
  trades: TradeRow[];
  validation: PayloadValidation;
  readiness: FileReadinessReport[];
  dataHealth: DataHealth;
  benchmarkCurve: BenchmarkRow[];
  benchmarkGovernance: BenchmarkGovernance;
  tradesBeforeDedupe: number;
  duplicateRowsRemoved: number;
  bondReferenceCusips?: Set<string>;
  issuerMappingIssuers?: Set<string>;
  issuer?: string | null;
  maturityBucket?: string | null;
  periodDays?: number;
}): PayloadBuildResult {
  const trades = input.trades;
  const validation = input.validation;
  const benchmarkCurve = input.benchmarkCurve;
  const spreadObs = buildSpreadObservations(trades, benchmarkCurve);
  const dataAudit = buildDataAuditCenter({
    rows: input.rows,
    tradesBeforeDedupe: input.tradesBeforeDedupe,
    trades,
    duplicateRowsRemoved: input.duplicateRowsRemoved,
    validation,
    readiness: input.readiness,
    spreadObs,
    bondReferenceCusips: input.bondReferenceCusips,
    issuerMappingIssuers: input.issuerMappingIssuers
  });
  const periodDays = input.periodDays ?? 30;
  const securityScreener = buildSecurityScreener(trades, benchmarkCurve, periodDays);
  let issuer = textValue(input.issuer) ?? mode(trades.map((trade) => trade.issuer));
  let maturityBucket = textValue(input.maturityBucket);

  const payload: NextsrPayload = {
    schema_version: "nextsr_payload.v1",
    issuer,
    maturity_bucket: maturityBucket,
    as_of_date: null,
    universe: {
      trade_rows: trades.length,
      cusip_count: new Set(trades.map((trade) => trade.cusip).filter(Boolean)).size,
      benchmark_source: benchmarkCurve[0]?.benchmark_source ?? null
    },
    signals: {
      spread: {
        current_spread_bps: null,
        spread_change_bps: null,
        historical_percentile_1y: null,
        latest_spread_date: null
      },
      liquidity: {
        liquidity_score: null,
        trade_count: 0,
        total_trade_amount: 0,
        days_since_last_trade: null
      },
      flow: {
        sell_buy_imbalance: null,
        classified_buy_amount: 0,
        classified_sell_amount: 0
      }
    },
    label: "Neutral / Needs More Evidence",
    evidence: []
  };

  if (!trades.length) {
    payload.evidence.push("No model-ready trade rows were available.");
    return {
      payload,
      validation,
      security_screener: securityScreener,
      dashboard: {
        ...emptyDashboard(),
        file_readiness: input.readiness,
        data_health: input.dataHealth,
        data_audit_center: dataAudit,
        data_quality_scorecard: buildDataQualityScorecard(dataAudit),
        benchmark_governance: input.benchmarkGovernance
      }
    };
  }

  issuer = issuer ?? "Unknown";
  payload.issuer = issuer;
  const issuerTrades = trades.filter((trade) => trade.issuer === issuer);
  if (!maturityBucket) {
    maturityBucket = mode(issuerTrades.map((trade) => trade.maturity_bucket ?? ""));
    payload.maturity_bucket = maturityBucket;
  }

  const fallbackDashboard = buildDashboardAnalytics({
    trades,
    benchmarkCurve,
    spreadObs,
    securityScreener,
    readiness: input.readiness,
    dataHealth: input.dataHealth,
    dataAudit,
    benchmarkGovernance: input.benchmarkGovernance,
    issuer,
    maturityBucket,
    periodDays
  });

  let obs = spreadObs.filter((row) => row.issuer === issuer);
  if (maturityBucket) {
    obs = obs.filter((row) => row.maturity_bucket === maturityBucket);
  }
  obs.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  if (!obs.length) {
    payload.evidence.push("No spread observations matched the selected issuer and maturity bucket.");
    return { payload, validation, security_screener: securityScreener, dashboard: fallbackDashboard };
  }

  const latest = obs[obs.length - 1];
  const currentSpread = latest.spread_to_benchmark_bps;
  const latestDate = latest.trade_date;
  const cutoff = new Date(`${latestDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - periodDays);
  const historical = obs.filter((row) => new Date(`${row.trade_date}T00:00:00Z`).getTime() <= cutoff.getTime());
  const spreadChange = historical.length ? currentSpread - historical[historical.length - 1].spread_to_benchmark_bps : null;

  const oneYearCutoff = new Date(`${latestDate}T00:00:00Z`);
  oneYearCutoff.setUTCDate(oneYearCutoff.getUTCDate() - 365);
  const oneYearValues = obs
    .filter((row) => new Date(`${row.trade_date}T00:00:00Z`).getTime() >= oneYearCutoff.getTime())
    .map((row) => row.spread_to_benchmark_bps);
  const percentile = oneYearValues.length >= 2 ? (oneYearValues.filter((value) => value <= currentSpread).length / oneYearValues.length) * 100 : null;

  const selectedTrades = issuerTrades.filter((trade) => !maturityBucket || trade.maturity_bucket === maturityBucket);
  const liquidity = buildLiquiditySignal(selectedTrades, latestDate, periodDays);
  const flow = buildFlowSignal(selectedTrades, latestDate, periodDays);

  payload.as_of_date = latestDate;
  payload.signals.spread = {
    current_spread_bps: roundOrNull(currentSpread, 2),
    spread_change_bps: roundOrNull(spreadChange, 2),
    historical_percentile_1y: roundOrNull(percentile, 1),
    latest_spread_date: latestDate
  };
  payload.signals.liquidity = liquidity;
  payload.signals.flow = flow;
  payload.label = labelSignal(payload.signals.spread.spread_change_bps, payload.signals.spread.historical_percentile_1y, liquidity.liquidity_score, flow.sell_buy_imbalance);
  payload.evidence.push(`Current spread is ${currentSpread >= 0 ? "+" : ""}${currentSpread.toFixed(1)} bps as of ${latestDate}.`);
  if (payload.signals.spread.spread_change_bps !== null) {
    const movement = payload.signals.spread.spread_change_bps;
    payload.evidence.push(`${periodDays}-day spread movement is ${movement >= 0 ? "+" : ""}${movement.toFixed(1)} bps.`);
  }
  if (liquidity.liquidity_score !== null) {
    payload.evidence.push(`Liquidity score is ${liquidity.liquidity_score.toFixed(1)} from ${liquidity.trade_count} trade(s) in the selected window.`);
  }

  return {
    payload,
    validation,
    security_screener: securityScreener,
    dashboard: buildDashboardAnalytics({
      trades,
      benchmarkCurve,
      spreadObs,
      securityScreener,
      readiness: input.readiness,
      dataHealth: input.dataHealth,
      dataAudit,
      benchmarkGovernance: input.benchmarkGovernance,
      issuer,
      maturityBucket,
      periodDays,
      payload
    })
  };
}

export function buildNextsrPayloadFromRows(input: {
  rows: RawRow[];
  sourceFile: string | null;
  issuer?: string | null;
  maturityBucket?: string | null;
  periodDays?: number;
}): PayloadBuildResult {
  const rows = input.rows;
  const standardized = standardizeRows(rows, input.sourceFile);
  const { trades, removed } = dedupeTrades(standardized);
  const tradeIndexCurve = buildTradeIndexCurve(trades);
  const benchmarkCurve = tradeIndexCurve;
  const benchmarkGovernance = buildBenchmarkGovernance({
    tradeIndexCurve,
    uploadedMmdCurve: [],
    activeCurve: benchmarkCurve
  });
  const validation = buildValidation(rows, trades, input.sourceFile);
  const readiness = [buildReadinessReport(rows, trades, input.sourceFile, "Trade File")];
  const dataHealth = buildDataHealth({
    tradeFiles: input.sourceFile ? 1 : 0,
    rawRows: rows.length,
    trades,
    duplicateRowsRemoved: removed,
    benchmarkCurve,
    bondReferenceRows: 0,
    issuerMappingRows: 0,
    mmdRows: 0
  });
  return buildPreparedResult({
    rows,
    trades,
    validation,
    readiness,
    dataHealth,
    benchmarkCurve,
    benchmarkGovernance,
    tradesBeforeDedupe: standardized.length,
    duplicateRowsRemoved: removed,
    issuer: input.issuer,
    maturityBucket: input.maturityBucket,
    periodDays: input.periodDays
  });
}

export function buildNextsrPayloadFromFiles(input: {
  tradeFiles: TradeFileInput[];
  bondRows?: RawRow[];
  issuerMappingRows?: RawRow[];
  mmdRows?: RawRow[];
  issuer?: string | null;
  maturityBucket?: string | null;
  periodDays?: number;
}): PayloadBuildResult {
  const tradeFiles = input.tradeFiles.filter((file) => file.rows.length > 0);
  const perFile = tradeFiles.map((file) => {
    const trades = standardizeRows(file.rows, file.sourceFile);
    return {
      file,
      trades,
      readiness: buildReadinessReport(file.rows, trades, file.sourceFile, "Trade File")
    };
  });

  const allRows = tradeFiles.flatMap((file) => file.rows);
  const rawTrades = perFile.flatMap((item) => item.trades);
  const bondReference = standardizeBondReference(input.bondRows ?? []);
  const issuerMapping = standardizeIssuerMapping(input.issuerMappingRows ?? []);
  const enrichedTrades = enrichTrades(rawTrades, bondReference, issuerMapping);
  const { trades, removed } = dedupeTrades(enrichedTrades);
  const tradeIndexCurve = buildTradeIndexCurve(trades);
  const uploadedMmdCurve = parseMmdBenchmarkCurve(input.mmdRows ?? []);
  const benchmarkCurve = tradeIndexCurve.length ? tradeIndexCurve : uploadedMmdCurve;
  const benchmarkGovernance = buildBenchmarkGovernance({
    tradeIndexCurve,
    uploadedMmdCurve,
    activeCurve: benchmarkCurve
  });
  const validation = buildValidation(allRows, trades, tradeFiles.length === 1 ? tradeFiles[0].sourceFile : `${tradeFiles.length} trade file(s)`);
  const dataHealth = buildDataHealth({
    tradeFiles: tradeFiles.length,
    rawRows: allRows.length,
    trades,
    duplicateRowsRemoved: removed,
    benchmarkCurve,
    bondReferenceRows: input.bondRows?.length ?? 0,
    issuerMappingRows: input.issuerMappingRows?.length ?? 0,
    mmdRows: input.mmdRows?.length ?? 0
  });

  const readiness = [
    ...perFile.map((item) => item.readiness),
    ...(input.bondRows?.length
      ? [{
          ...buildValidation(input.bondRows, [], "Bond Reference"),
          dataset: "Bond Reference",
          can_run: true,
          warnings: []
        } satisfies FileReadinessReport]
      : []),
    ...(input.issuerMappingRows?.length
      ? [{
          ...buildValidation(input.issuerMappingRows, [], "Issuer Mapping"),
          dataset: "Issuer Mapping",
          can_run: true,
          warnings: []
        } satisfies FileReadinessReport]
      : []),
    ...(input.mmdRows?.length
      ? [{
          ...buildValidation(input.mmdRows, [], "MMD Benchmark"),
          dataset: "MMD Benchmark",
          can_run: uploadedMmdCurve.length > 0,
          warnings: uploadedMmdCurve.length ? [] : ["No date/tenor benchmark columns were detected."]
        } satisfies FileReadinessReport]
      : [])
  ];

  return buildPreparedResult({
    rows: allRows,
    trades,
    validation,
    readiness,
    dataHealth,
    benchmarkCurve,
    benchmarkGovernance,
    tradesBeforeDedupe: enrichedTrades.length,
    duplicateRowsRemoved: removed,
    bondReferenceCusips: input.bondRows?.length ? new Set(bondReference.keys()) : undefined,
    issuerMappingIssuers: input.issuerMappingRows?.length ? new Set(issuerMapping.keys()) : undefined,
    issuer: input.issuer,
    maturityBucket: input.maturityBucket,
    periodDays: input.periodDays
  });
}

export function buildNextsrPayloadFromCsv(input: {
  csvText: string;
  sourceFile: string | null;
  issuer?: string | null;
  maturityBucket?: string | null;
  periodDays?: number;
}): PayloadBuildResult {
  return buildNextsrPayloadFromRows({
    rows: parseCsv(input.csvText),
    sourceFile: input.sourceFile,
    issuer: input.issuer,
    maturityBucket: input.maturityBucket,
    periodDays: input.periodDays
  });
}
