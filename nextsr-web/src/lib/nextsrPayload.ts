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
};

export type RawRow = Record<string, string>;
export type SecurityCandidate = {
  cusip: string;
  issuer: string;
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
  maturity_bucket: string | null;
};

type BenchmarkRow = {
  date: string;
  tenor: string;
  benchmark_yield: number;
  benchmark_source: string;
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
        maturity_bucket: null
      };
    })
    .filter((row) => row.cusip && row.trade_date)
    .map((row) => ({
      ...row,
      maturity_bucket: maturityBucket(row.maturity, row.trade_date)
    }));
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
        benchmark_source: "Trade Sheet Index / Index Rate"
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

export function buildNextsrPayloadFromRows(input: {
  rows: RawRow[];
  sourceFile: string | null;
  issuer?: string | null;
  maturityBucket?: string | null;
  periodDays?: number;
}): PayloadBuildResult {
  const rows = input.rows;
  const trades = standardizeRows(rows, input.sourceFile);
  const validation = buildValidation(rows, trades, input.sourceFile);
  const benchmarkCurve = buildTradeIndexCurve(trades);
  const spreadObs = buildSpreadObservations(trades, benchmarkCurve);
  const securityScreener = buildSecurityScreener(trades, benchmarkCurve, input.periodDays ?? 30);
  const periodDays = input.periodDays ?? 30;
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
      benchmark_source: benchmarkCurve.length ? "Trade Sheet Index / Index Rate" : null
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
    return { payload, validation, security_screener: securityScreener };
  }

  issuer = issuer ?? "Unknown";
  payload.issuer = issuer;
  const issuerTrades = trades.filter((trade) => trade.issuer === issuer);
  if (!maturityBucket) {
    maturityBucket = mode(issuerTrades.map((trade) => trade.maturity_bucket ?? ""));
    payload.maturity_bucket = maturityBucket;
  }

  let obs = spreadObs.filter((row) => row.issuer === issuer);
  if (maturityBucket) {
    obs = obs.filter((row) => row.maturity_bucket === maturityBucket);
  }
  obs.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  if (!obs.length) {
    payload.evidence.push("No spread observations matched the selected issuer and maturity bucket.");
    return { payload, validation, security_screener: securityScreener };
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

  return { payload, validation, security_screener: securityScreener };
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
