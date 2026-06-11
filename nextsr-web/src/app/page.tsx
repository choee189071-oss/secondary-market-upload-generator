"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ActivityPoint,
  BenchmarkAuditRow,
  CrossIssuerRvPoint,
  CurvePoint,
  CurveShapeMetric,
  DashboardAnalytics,
  DealerProxyPoint,
  HistoricalSpreadPoint,
  IssuerOption,
  LiquidityPoint,
  NextsrPayload,
  PayloadValidation,
  PeerRvPoint,
  PositionPoint,
  ScenarioShockPoint,
  SecurityDetail,
  SecurityTradePoint,
  SecurityCandidate,
  SpreadAttributionPoint,
  SpreadMovementPoint,
  TrendPoint
} from "@/lib/nextsrPayload";

const maturityBuckets = ["", ...Array.from({ length: 40 }, (_, index) => `${index + 1}Y`)];
const lookbackOptions = [7, 30, 60, 90, 180, 365];
const validationOrder = ["cusip", "trade_date", "yield", "maturity", "trade_amount", "index_rate", "spread", "trade_type", "price", "ratings"];

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function linePath<T>(data: T[], x: (point: T, index: number) => number, y: (point: T) => number | null) {
  return data
    .map((point, index) => {
      const yValue = y(point);
      if (yValue === null || !Number.isFinite(yValue)) {
        return "";
      }
      return `${x(point, index)},${yValue}`;
    })
    .filter(Boolean)
    .join(" ");
}

function EmptyChart() {
  return <div className="empty-chart">No chartable observations.</div>;
}

function BarMetricChart<T>({ data, label, value, tone = "teal" }: { data: T[]; label: (point: T) => string; value: (point: T) => number | null; tone?: "teal" | "rose" | "blue" }) {
  const values = data.map(value).filter((item): item is number => item !== null && Number.isFinite(item));
  if (!data.length || !values.length) {
    return <EmptyChart />;
  }
  const max = Math.max(...values.map((item) => Math.abs(item)), 1);
  const barWidth = 700 / data.length;
  return (
    <svg className="chart-svg compact" viewBox="0 0 800 280" role="img">
      <line className="grid-line" x1="42" x2="758" y1="230" y2="230" />
      {data.map((point, index) => {
        const rawValue = value(point) ?? 0;
        const height = (Math.abs(rawValue) / max) * 180;
        const x = 52 + index * barWidth;
        return (
          <g key={`${label(point)}-${index}`}>
            <rect className={`bar ${tone}`} height={height} width={Math.max(7, barWidth - 8)} x={x} y={230 - height}>
              <title>{`${label(point)}: ${formatNumber(rawValue)}`}</title>
            </rect>
            {index % Math.ceil(data.length / 12 || 1) === 0 ? <text className="axis-label" x={x + barWidth / 2} y="254" textAnchor="middle">{label(point)}</text> : null}
          </g>
        );
      })}
      <text className="axis-label" x="10" y="36">{formatNumber(max)}</text>
    </svg>
  );
}

function MiniTable<T>({ columns, rows }: { columns: Array<{ key: string; header: string; render: (row: T) => string | number | null | undefined }>; rows: T[] }) {
  if (!rows.length) {
    return <div className="empty-state small">No table observations.</div>;
  }
  return (
    <div className="table-wrap mini">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => <td key={column.key}>{column.render(row) ?? "N/A"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssuerCurveChart({ data, showIssuer = true, showBenchmark = true }: { data: CurvePoint[]; showIssuer?: boolean; showBenchmark?: boolean }) {
  const values = data.flatMap((point) => [point.issuer_yield, point.benchmark_yield]).filter((value): value is number => value !== null);
  if (!data.length || !values.length) {
    return <EmptyChart />;
  }
  const min = Math.min(...values) - 0.15;
  const max = Math.max(...values) + 0.15;
  const x = (point: CurvePoint) => 42 + ((point.maturity_year - 1) / 39) * 716;
  const y = (value: number | null) => {
    if (value === null) return null;
    return 300 - ((value - min) / (max - min || 1)) * 244;
  };
  return (
    <svg className="chart-svg" viewBox="0 0 800 340" role="img">
      {[0, 1, 2, 3].map((tick) => {
        const yy = 300 - tick * 70;
        const label = min + ((max - min) * tick) / 3;
        return (
          <g key={tick}>
            <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
            <text className="axis-label" x="10" y={yy + 4}>{label.toFixed(2)}%</text>
          </g>
        );
      })}
      {showBenchmark ? <polyline className="line benchmark" points={linePath(data, x, (point) => y(point.benchmark_yield))} /> : null}
      {showIssuer ? <polyline className="line issuer" points={linePath(data, x, (point) => y(point.issuer_yield))} /> : null}
      {showIssuer
        ? data.filter((point) => point.issuer_yield !== null).map((point) => (
            <circle className="dot issuer-dot" cx={x(point)} cy={y(point.issuer_yield) ?? 0} key={point.maturity_bucket} r="3.4">
              <title>{`${point.maturity_bucket}: issuer ${point.issuer_yield ?? "N/A"}%, benchmark ${point.benchmark_yield ?? "N/A"}%, spread ${point.spread_bps ?? "N/A"} bps`}</title>
            </circle>
          ))
        : null}
      {[1, 5, 10, 15, 20, 25, 30, 35, 40].map((year) => (
        <text className="axis-label" key={year} x={42 + ((year - 1) / 39) * 716} y="324" textAnchor="middle">{year}Y</text>
      ))}
    </svg>
  );
}

function SpreadTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return <EmptyChart />;
  }
  const values = data.map((point) => point.spread_bps);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const x = (_point: TrendPoint, index: number) => 42 + (index / Math.max(data.length - 1, 1)) * 716;
  const y = (value: number) => 300 - ((value - min) / (max - min || 1)) * 244;
  return (
    <svg className="chart-svg" viewBox="0 0 800 340" role="img">
      {[0, 1, 2, 3].map((tick) => {
        const yy = 300 - tick * 70;
        const label = min + ((max - min) * tick) / 3;
        return (
          <g key={tick}>
            <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
            <text className="axis-label" x="8" y={yy + 4}>{label.toFixed(0)}</text>
          </g>
        );
      })}
      <line className="zero-line" x1="42" x2="758" y1={y(0)} y2={y(0)} />
      <polyline className="line spread" points={linePath(data, x, (point) => y(point.spread_bps))} />
      {data.map((point, index) => (
        <circle className="dot issuer-dot" cx={x(point, index)} cy={y(point.spread_bps)} key={`${point.date}-${index}`} r="3">
          <title>{`${point.date}: ${point.spread_bps} bps; yield ${point.avg_yield}%; benchmark ${point.benchmark_yield}%`}</title>
        </circle>
      ))}
      <text className="axis-label" x="42" y="324">{data[0].date}</text>
      <text className="axis-label" x="758" y="324" textAnchor="end">{data[data.length - 1].date}</text>
    </svg>
  );
}

function ActivityChart({ data }: { data: ActivityPoint[] }) {
  if (!data.length) {
    return <EmptyChart />;
  }
  const max = Math.max(...data.map((point) => point.trade_count), 1);
  const barWidth = 700 / data.length;
  return (
    <svg className="chart-svg" viewBox="0 0 800 280" role="img">
      <line className="grid-line" x1="42" x2="758" y1="230" y2="230" />
      {data.map((point, index) => {
        const height = (point.trade_count / max) * 190;
        const x = 52 + index * barWidth;
        return (
          <g key={point.month}>
            <rect className="bar activity" height={height} width={Math.max(8, barWidth - 8)} x={x} y={230 - height}>
              <title>{`${point.month}: ${point.trade_count.toLocaleString()} trades; ${point.total_trade_amount.toLocaleString()} par`}</title>
            </rect>
            {index % 2 === 0 ? <text className="axis-label" x={x + barWidth / 2} y="254" textAnchor="middle">{point.month.slice(5)}</text> : null}
          </g>
        );
      })}
      <text className="axis-label" x="10" y="36">{max.toLocaleString()} trades</text>
    </svg>
  );
}

function PositioningChart({ data, selectedCusip, onSelect }: { data: PositionPoint[]; selectedCusip?: string; onSelect?: (cusip: string) => void }) {
  const points = data.filter((point) => point.spread_bps !== null && point.liquidity_score !== null);
  if (!points.length) {
    return <EmptyChart />;
  }
  const spreads = points.map((point) => point.spread_bps ?? 0);
  const minSpread = Math.min(...spreads) - 5;
  const maxSpread = Math.max(...spreads) + 5;
  const x = (value: number | null) => 42 + ((value ?? 0) / 100) * 716;
  const y = (value: number | null) => 300 - (((value ?? 0) - minSpread) / (maxSpread - minSpread || 1)) * 244;
  return (
    <svg className="chart-svg" viewBox="0 0 800 340" role="img">
      {[25, 50, 75].map((tick) => <line className="grid-line vertical" key={tick} x1={x(tick)} x2={x(tick)} y1="56" y2="300" />)}
      {[0, 1, 2, 3].map((tick) => {
        const yy = 300 - tick * 70;
        const label = minSpread + ((maxSpread - minSpread) * tick) / 3;
        return (
          <g key={tick}>
            <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
            <text className="axis-label" x="8" y={yy + 4}>{label.toFixed(0)}</text>
          </g>
        );
      })}
      {points.slice(0, 60).map((point) => (
        <circle
          className={`${point.signal.includes("Wide") ? "bubble hot" : "bubble"} ${point.cusip === selectedCusip ? "selected" : ""}`}
          cx={x(point.liquidity_score)}
          cy={y(point.spread_bps)}
          key={point.cusip}
          onClick={() => onSelect?.(point.cusip)}
          r={Math.max(4, Math.min(13, Math.sqrt(point.total_trade_amount || 1) / 850))}
        >
          <title>{`${point.cusip}: spread ${point.spread_bps ?? "N/A"} bps; liquidity ${point.liquidity_score ?? "N/A"}; RV ${point.rv_score ?? "N/A"}`}</title>
        </circle>
      ))}
      <text className="axis-label" x="42" y="324">Liquidity 0</text>
      <text className="axis-label" x="758" y="324" textAnchor="end">Liquidity 100</text>
    </svg>
  );
}

export default function Home() {
  const [tradeFiles, setTradeFiles] = useState<File[]>([]);
  const [bondReference, setBondReference] = useState<File | null>(null);
  const [issuerMapping, setIssuerMapping] = useState<File | null>(null);
  const [mmdBenchmark, setMmdBenchmark] = useState<File | null>(null);
  const [issuer, setIssuer] = useState("");
  const [maturityBucket, setMaturityBucket] = useState("");
  const [periodDays, setPeriodDays] = useState(30);
  const [minSpread, setMinSpread] = useState(15);
  const [minLiquidity, setMinLiquidity] = useState(40);
  const [minTrades, setMinTrades] = useState(2);
  const [payload, setPayload] = useState<NextsrPayload | null>(null);
  const [validation, setValidation] = useState<PayloadValidation | null>(null);
  const [candidates, setCandidates] = useState<SecurityCandidate[]>([]);
  const [dashboard, setDashboard] = useState<DashboardAnalytics | null>(null);
  const [selectedCusip, setSelectedCusip] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showIssuerCurve, setShowIssuerCurve] = useState(true);
  const [showBenchmarkCurve, setShowBenchmarkCurve] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("nextsr-watchlist");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed.filter((item) => typeof item === "string"));
        }
      } catch {
        setWatchlist([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("nextsr-watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  const jsonText = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ""), [payload]);
  const filteredCandidates = useMemo(
    () =>
      candidates
        .filter((candidate) => (candidate.spread_to_benchmark_bps ?? -Infinity) >= minSpread)
        .filter((candidate) => (candidate.liquidity_score ?? -Infinity) >= minLiquidity)
        .filter((candidate) => candidate.trade_count >= minTrades)
        .slice(0, 25),
    [candidates, minLiquidity, minSpread, minTrades]
  );
  const downloadHref = useMemo(() => {
    if (!jsonText) {
      return "";
    }
    return `data:application/json;charset=utf-8,${encodeURIComponent(jsonText)}`;
  }, [jsonText]);
  const exportSummaryHref = useMemo(() => {
    if (!dashboard?.export_summary_markdown) {
      return "";
    }
    return `data:text/markdown;charset=utf-8,${encodeURIComponent(dashboard.export_summary_markdown)}`;
  }, [dashboard]);
  const candidateCsvHref = useMemo(() => {
    if (!candidates.length) {
      return "";
    }
    const headers = ["signal", "cusip", "issuer", "maturity_bucket", "spread_to_benchmark_bps", "liquidity_score", "rv_score", "trade_count", "total_trade_amount", "latest_trade_date"];
    const rows = candidates.map((candidate) => headers.map((header) => JSON.stringify(candidate[header as keyof SecurityCandidate] ?? "")).join(","));
    return `data:text/csv;charset=utf-8,${encodeURIComponent([headers.join(","), ...rows].join("\n"))}`;
  }, [candidates]);
  const htmlReportHref = useMemo(() => {
    const html = dashboard?.report_artifacts.html_report;
    return html ? `data:text/html;charset=utf-8,${encodeURIComponent(html)}` : "";
  }, [dashboard]);
  const chartDataHref = useMemo(() => {
    const data = dashboard?.report_artifacts.chart_data_json;
    return data ? `data:application/json;charset=utf-8,${encodeURIComponent(data)}` : "";
  }, [dashboard]);
  const selectedSecurity = useMemo(() => {
    if (!dashboard?.security_details.length) {
      return null;
    }
    return dashboard.security_details.find((item) => item.cusip === selectedCusip) ?? dashboard.security_details[0];
  }, [dashboard, selectedCusip]);
  const watchlistRows = useMemo(() => {
    const details = dashboard?.security_details ?? [];
    return watchlist
      .map((cusip) => details.find((detail) => detail.cusip === cusip) ?? candidates.find((candidate) => candidate.cusip === cusip))
      .filter((item): item is SecurityDetail | SecurityCandidate => Boolean(item));
  }, [candidates, dashboard, watchlist]);
  const watchlistCsvHref = useMemo(() => {
    if (!watchlistRows.length) {
      return "";
    }
    const headers = ["cusip", "issuer", "signal", "maturity_bucket", "spread_to_benchmark_bps", "liquidity_score", "rv_score", "trade_count", "total_trade_amount", "latest_trade_date"];
    const rows = watchlistRows.map((row) => headers.map((header) => JSON.stringify(row[header as keyof typeof row] ?? "")).join(","));
    return `data:text/csv;charset=utf-8,${encodeURIComponent([headers.join(","), ...rows].join("\n"))}`;
  }, [watchlistRows]);

  function toggleWatchlist(cusip: string) {
    setWatchlist((current) => (current.includes(cusip) ? current.filter((item) => item !== cusip) : [...current, cusip].sort()));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tradeFiles.length) {
      setError("Select at least one CSV or Excel trade file.");
      return;
    }

    setError("");
    setIsLoading(true);
    setPayload(null);
    setValidation(null);
    setCandidates([]);
    setDashboard(null);
    setSelectedCusip("");

    const formData = new FormData();
    tradeFiles.forEach((file) => formData.append("tradeFiles", file));
    if (bondReference) formData.set("bondReference", bondReference);
    if (issuerMapping) formData.set("issuerMapping", issuerMapping);
    if (mmdBenchmark) formData.set("mmdBenchmark", mmdBenchmark);
    formData.set("issuer", issuer);
    formData.set("maturityBucket", maturityBucket);
    formData.set("periodDays", String(periodDays));

    try {
      const response = await fetch("/api/nextsr-payload", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Payload generation failed.");
      }
      setPayload(data.payload);
      setValidation(data.validation);
      setCandidates(data.security_screener ?? []);
      setDashboard(data.dashboard ?? null);
      setSelectedCusip(data.dashboard?.security_details?.[0]?.cusip ?? data.security_screener?.[0]?.cusip ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payload generation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>NextSR Upload Generator</h1>
          <span>Municipal secondary-market payload workspace</span>
        </div>
        <span className="status-pill">nextsr_payload.v1</span>
      </header>

      <div className="workspace">
        <section className="panel">
          <h2>Input</h2>
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="trade-file">Trade Files</label>
              <input
                id="trade-file"
                accept=".csv,.xlsx,.xls,text/csv"
                multiple
                type="file"
                onChange={(event) => setTradeFiles(Array.from(event.target.files ?? []))}
              />
              <span className="field-help">{tradeFiles.length ? `${tradeFiles.length} file(s) selected` : "Upload one or more MuniPro trade-history exports."}</span>
            </div>

            <details className="input-expander">
              <summary>Optional Reference Files</summary>
              <div className="form-stack compact-stack">
                <div className="field">
                  <label htmlFor="bond-reference">Bond Reference</label>
                  <input id="bond-reference" accept=".csv,.xlsx,.xls,text/csv" type="file" onChange={(event) => setBondReference(event.target.files?.[0] ?? null)} />
                </div>
                <div className="field">
                  <label htmlFor="issuer-mapping">Issuer / Sector Mapping</label>
                  <input id="issuer-mapping" accept=".csv,.xlsx,.xls,text/csv" type="file" onChange={(event) => setIssuerMapping(event.target.files?.[0] ?? null)} />
                </div>
                <div className="field">
                  <label htmlFor="mmd-benchmark">MMD / Benchmark Curve</label>
                  <input id="mmd-benchmark" accept=".csv,.xlsx,.xls,text/csv" type="file" onChange={(event) => setMmdBenchmark(event.target.files?.[0] ?? null)} />
                </div>
              </div>
            </details>

            {dashboard?.issuers.length ? (
              <div className="field">
                <label htmlFor="issuer-picker">Uploaded Issuers</label>
                <select id="issuer-picker" value={issuer} onChange={(event) => setIssuer(event.target.value)}>
                  <option value="">Auto</option>
                  {dashboard.issuers.map((option: IssuerOption) => (
                    <option key={option.issuer} value={option.issuer}>
                      {option.issuer}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="issuer">Issuer Override</label>
              <input
                id="issuer"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
                placeholder="Auto-detect from file name"
              />
            </div>

            <div className="field">
              <label htmlFor="bucket">Maturity Bucket</label>
              <select id="bucket" value={maturityBucket} onChange={(event) => setMaturityBucket(event.target.value)}>
                {maturityBuckets.map((bucket) => (
                  <option key={bucket || "auto"} value={bucket}>
                    {bucket || "Auto"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="lookback">Lookback</label>
              <select id="lookback" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
                {lookbackOptions.map((days) => (
                  <option key={days} value={days}>
                    {days}D
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-grid">
              <div className="field">
                <label htmlFor="min-spread">Min Spread</label>
                <input
                  id="min-spread"
                  min="-100"
                  step="5"
                  type="number"
                  value={minSpread}
                  onChange={(event) => setMinSpread(Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="min-liquidity">Min Liquidity</label>
                <input
                  id="min-liquidity"
                  max="100"
                  min="0"
                  step="5"
                  type="number"
                  value={minLiquidity}
                  onChange={(event) => setMinLiquidity(Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="min-trades">Min Trades</label>
                <input
                  id="min-trades"
                  min="1"
                  step="1"
                  type="number"
                  value={minTrades}
                  onChange={(event) => setMinTrades(Number(event.target.value))}
                />
              </div>
            </div>

            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate Dashboard"}
            </button>
          </form>

          {validation ? (
            <div className="validation-panel">
              <div className="validation-summary">
                <div>
                  <span>Raw Rows</span>
                  <strong>{validation.raw_rows.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Model Ready</span>
                  <strong>{validation.model_ready_rows.toLocaleString()}</strong>
                </div>
              </div>
              <div className="field-grid">
                {validationOrder.map((field) => {
                  const detected = validation.detected_fields[field];
                  const isMissing = detected === null;
                  return (
                    <div className={isMissing ? "field-chip missing" : "field-chip"} key={field}>
                      <span>{field}</span>
                      <strong>{detected ?? "missing"}</strong>
                    </div>
                  );
                })}
              </div>
              {validation.missing_required.length ? (
                <div className="validation-warning">Missing required: {validation.missing_required.join(", ")}</div>
              ) : null}
              {validation.missing_recommended.length ? (
                <div className="validation-note">Missing recommended: {validation.missing_recommended.join(", ")}</div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="toolbar">
            <h2>Output</h2>
            {payload ? (
              <div className="button-row">
                <a className="secondary-button" href={downloadHref} download="nextsr_payload.json">
                  Download JSON
                </a>
                {exportSummaryHref ? (
                  <a className="secondary-button" href={exportSummaryHref} download="secondary_market_summary.md">
                    Summary MD
                  </a>
                ) : null}
                {candidateCsvHref ? (
                  <a className="secondary-button" href={candidateCsvHref} download="security_screener.csv">
                    Screener CSV
                  </a>
                ) : null}
                {htmlReportHref ? (
                  <a className="secondary-button" href={htmlReportHref} download="secondary_market_report.html">
                    HTML Report
                  </a>
                ) : null}
                {chartDataHref ? (
                  <a className="secondary-button" href={chartDataHref} download="chart_data_bundle.json">
                    Chart Data
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <div className="error-state">{error}</div> : null}

          {!error && !payload ? <div className="empty-state">No payload generated.</div> : null}

          {payload ? (
            <div className="content-grid">
              <div className="metrics">
                <div className="metric">
                  <span>Issuer</span>
                  <strong>{payload.issuer ?? "N/A"}</strong>
                </div>
                <div className="metric">
                  <span>Bucket</span>
                  <strong>{payload.maturity_bucket ?? "N/A"}</strong>
                </div>
                <div className="metric">
                  <span>Label</span>
                  <strong>{payload.label}</strong>
                </div>
                <div className="metric">
                  <span>As Of</span>
                  <strong>{payload.as_of_date ?? "N/A"}</strong>
                </div>
                <div className="metric">
                  <span>Spread</span>
                  <strong>{formatNumber(payload.signals.spread.current_spread_bps, " bps")}</strong>
                </div>
                <div className="metric">
                  <span>Liquidity</span>
                  <strong>{formatNumber(payload.signals.liquidity.liquidity_score)}</strong>
                </div>
                <div className="metric">
                  <span>Trade Rows</span>
                  <strong>{payload.universe.trade_rows.toLocaleString()}</strong>
                </div>
                <div className="metric">
                  <span>CUSIPs</span>
                  <strong>{payload.universe.cusip_count.toLocaleString()}</strong>
                </div>
              </div>
              <details className="developer-payload">
                <summary>Developer Payload</summary>
                <pre className="json-block">{jsonText}</pre>
              </details>
            </div>
          ) : null}
        </section>
      </div>

      {payload && dashboard ? (
        <section className="parity-band">
          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>File Readiness Check</h2>
                <p>Streamlit parity layer for uploaded trade and optional reference files.</p>
              </div>
            </div>
            <MiniTable
              rows={dashboard.file_readiness}
              columns={[
                { key: "dataset", header: "Dataset", render: (row) => row.dataset },
                { key: "source", header: "Source", render: (row) => row.source_file },
                { key: "raw", header: "Raw Rows", render: (row) => row.raw_rows.toLocaleString() },
                { key: "ready", header: "Model Ready", render: (row) => row.model_ready_rows.toLocaleString() },
                { key: "status", header: "Ready", render: (row) => (row.can_run ? "Yes" : "Review") },
                { key: "missing", header: "Missing Required", render: (row) => row.missing_required.join(", ") || "None" }
              ]}
            />
          </article>

          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>Data Health</h2>
                <p>Coverage, reference-file status, and benchmark governance.</p>
              </div>
            </div>
            <div className="metrics dense">
              <div className="metric"><span>Trade Files</span><strong>{dashboard.data_health.trade_files}</strong></div>
              <div className="metric"><span>Model Rows</span><strong>{dashboard.data_health.model_ready_rows.toLocaleString()}</strong></div>
              <div className="metric"><span>Issuers</span><strong>{dashboard.data_health.issuers.toLocaleString()}</strong></div>
              <div className="metric"><span>CUSIPs</span><strong>{dashboard.data_health.cusips.toLocaleString()}</strong></div>
              <div className="metric"><span>First Trade</span><strong>{dashboard.data_health.first_trade_date ?? "N/A"}</strong></div>
              <div className="metric"><span>Latest Trade</span><strong>{dashboard.data_health.latest_trade_date ?? "N/A"}</strong></div>
              <div className="metric"><span>Benchmark</span><strong>{dashboard.data_health.benchmark_source ?? "N/A"}</strong></div>
              <div className="metric"><span>Duplicates Removed</span><strong>{dashboard.data_health.duplicate_rows_removed.toLocaleString()}</strong></div>
            </div>
          </article>
        </section>
      ) : null}

      {payload && dashboard ? (
        <section className="visual-grid">
          <article className="panel chart-panel wide">
            <div className="chart-header">
              <div>
                <h2>{payload.issuer} Issuer Curve vs Benchmark</h2>
                <p>Average issuer yield by maturity bucket over the selected lookback window.</p>
              </div>
              <div className="legend">
                <button className={showIssuerCurve ? "legend-button active" : "legend-button"} type="button" onClick={() => setShowIssuerCurve((value) => !value)}>
                  <i className="legend-dot issuer-key" />Issuer
                </button>
                <button className={showBenchmarkCurve ? "legend-button active" : "legend-button"} type="button" onClick={() => setShowBenchmarkCurve((value) => !value)}>
                  <i className="legend-dot benchmark-key" />Benchmark
                </button>
              </div>
            </div>
            <IssuerCurveChart data={dashboard.issuer_curve} showIssuer={showIssuerCurve} showBenchmark={showBenchmarkCurve} />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Spread Trend</h2>
                <p>{payload.maturity_bucket ?? "Selected bucket"} spread to benchmark.</p>
              </div>
            </div>
            <SpreadTrendChart data={dashboard.spread_trend} />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Monthly Activity</h2>
                <p>Trade-count history for the uploaded issuer file.</p>
              </div>
            </div>
            <ActivityChart data={dashboard.monthly_activity} />
          </article>

          <article className="panel chart-panel wide">
            <div className="chart-header">
              <div>
                <h2>RV Positioning Map</h2>
                <p>Liquidity score versus spread, sized by total par traded.</p>
              </div>
            </div>
            <PositioningChart data={dashboard.positioning} selectedCusip={selectedCusip} onSelect={setSelectedCusip} />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Spread Movement Ladder</h2>
                <p>Latest spread movement by maturity bucket.</p>
              </div>
            </div>
            <MiniTable<SpreadMovementPoint>
              rows={dashboard.spread_movement_ladder.slice(0, 18)}
              columns={[
                { key: "bucket", header: "Bucket", render: (row) => row.maturity_bucket },
                { key: "latest", header: "Latest", render: (row) => formatNumber(row.latest_spread_bps, " bps") },
                { key: "m1", header: "1M", render: (row) => formatNumber(row.move_1m_bps, " bps") },
                { key: "m3", header: "3M", render: (row) => formatNumber(row.move_3m_bps, " bps") },
                { key: "y1", header: "1Y", render: (row) => formatNumber(row.move_1y_bps, " bps") }
              ]}
            />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Liquidity / Trading Frequency</h2>
                <p>Bucket-level trade frequency and liquidity score.</p>
              </div>
            </div>
            <BarMetricChart<LiquidityPoint> data={dashboard.liquidity} label={(row) => row.maturity_bucket} value={(row) => row.liquidity_score} tone="teal" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Peer Relative Value</h2>
                <p>Selected issuer spread versus peer median by bucket.</p>
              </div>
            </div>
            <BarMetricChart<PeerRvPoint> data={dashboard.peer_rv} label={(row) => row.maturity_bucket} value={(row) => row.peer_gap_bps} tone="rose" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Cross-Issuer RV Ranking</h2>
                <p>Issuer-level relative value score across uploaded files.</p>
              </div>
            </div>
            <MiniTable<CrossIssuerRvPoint>
              rows={dashboard.cross_issuer_rv.slice(0, 12)}
              columns={[
                { key: "issuer", header: "Issuer", render: (row) => row.issuer },
                { key: "spread", header: "Avg Spread", render: (row) => formatNumber(row.avg_spread_bps, " bps") },
                { key: "liq", header: "Liquidity", render: (row) => formatNumber(row.liquidity_score) },
                { key: "rv", header: "RV", render: (row) => formatNumber(row.rv_score) },
                { key: "trades", header: "Trades", render: (row) => row.trade_count.toLocaleString() }
              ]}
            />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Spread Attribution Waterfall</h2>
                <p>Benchmark yield plus issuer spread bridge.</p>
              </div>
            </div>
            <BarMetricChart<SpreadAttributionPoint> data={dashboard.spread_attribution} label={(row) => row.component} value={(row) => row.value_bps} tone="blue" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Historical Spread Range</h2>
                <p>Current spread percentile versus available history.</p>
              </div>
            </div>
            <MiniTable<HistoricalSpreadPoint>
              rows={dashboard.historical_percentiles.slice(0, 12)}
              columns={[
                { key: "bucket", header: "Bucket", render: (row) => row.maturity_bucket },
                { key: "current", header: "Current", render: (row) => formatNumber(row.current_spread_bps, " bps") },
                { key: "median", header: "Median", render: (row) => formatNumber(row.median_spread_bps, " bps") },
                { key: "pct", header: "Pctile", render: (row) => formatNumber(row.percentile, "%") },
                { key: "n", header: "Obs", render: (row) => row.observations.toLocaleString() }
              ]}
            />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Curve Shape Analytics</h2>
                <p>Slope, butterfly, and spread-curve diagnostics.</p>
              </div>
            </div>
            <MiniTable<CurveShapeMetric>
              rows={dashboard.curve_shape}
              columns={[
                { key: "metric", header: "Metric", render: (row) => row.metric },
                { key: "value", header: "Value", render: (row) => row.value === null ? "N/A" : `${row.value} ${row.unit}` },
                { key: "read", header: "Read-through", render: (row) => row.readthrough }
              ]}
            />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Scenario Shock Analysis</h2>
                <p>Approximate price impact by maturity bucket for a +25 bp shock.</p>
              </div>
            </div>
            <BarMetricChart<ScenarioShockPoint> data={dashboard.scenario_shock} label={(row) => row.maturity_bucket} value={(row) => row.approx_price_impact_pct} tone="rose" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Bid / Ask & Dealer Behavior Proxy</h2>
                <p>Buy/sell/other flow from uploaded trade side classifications.</p>
              </div>
            </div>
            <BarMetricChart<DealerProxyPoint> data={dashboard.dealer_proxy} label={(row) => row.side} value={(row) => row.total_trade_amount} tone="teal" />
          </article>
        </section>
      ) : null}

      {payload ? (
        <section className="panel screener-panel">
          <div className="toolbar">
            <h2>Security Screener</h2>
            <span className="table-count">{filteredCandidates.length.toLocaleString()} shown / {candidates.length.toLocaleString()} scored</span>
          </div>
          {filteredCandidates.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>CUSIP</th>
                    <th>Bucket</th>
                    <th>Spread</th>
                    <th>Liquidity</th>
                    <th>RV Score</th>
                    <th>Trades</th>
                    <th>Total Par</th>
                    <th>Latest</th>
                    <th>Watch</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((candidate) => (
                    <tr className={candidate.cusip === selectedCusip ? "selected-row" : ""} key={candidate.cusip}>
                      <td>{candidate.signal}</td>
                      <td>
                        <button className="link-button" type="button" onClick={() => setSelectedCusip(candidate.cusip)}>
                          {candidate.cusip}
                        </button>
                      </td>
                      <td>{candidate.maturity_bucket ?? "N/A"}</td>
                      <td>{formatNumber(candidate.spread_to_benchmark_bps, " bps")}</td>
                      <td>{formatNumber(candidate.liquidity_score)}</td>
                      <td>{formatNumber(candidate.rv_score)}</td>
                      <td>{candidate.trade_count.toLocaleString()}</td>
                      <td>{candidate.total_trade_amount.toLocaleString()}</td>
                      <td>{candidate.latest_trade_date ?? "N/A"}</td>
                      <td>
                        <button className="mini-button" type="button" onClick={() => toggleWatchlist(candidate.cusip)}>
                          {watchlist.includes(candidate.cusip) ? "Saved" : "Add"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No securities match the current screener filters.</div>
          )}
        </section>
      ) : null}

      {payload && dashboard ? (
        <section className="parity-band final-band">
          <article className="panel">
            <div className="toolbar">
              <div>
                <h2>CUSIP Opportunity Drilldown</h2>
                <span className="table-count">{selectedSecurity?.cusip ?? "No CUSIP selected"}</span>
              </div>
              {selectedSecurity ? (
                <button className="secondary-button" type="button" onClick={() => toggleWatchlist(selectedSecurity.cusip)}>
                  {watchlist.includes(selectedSecurity.cusip) ? "Remove Watch" : "Add Watch"}
                </button>
              ) : null}
            </div>
            {selectedSecurity ? (
              <div className="drilldown-stack">
                <div className="metrics dense">
                  <div className="metric"><span>CUSIP</span><strong>{selectedSecurity.cusip}</strong></div>
                  <div className="metric"><span>Signal</span><strong>{selectedSecurity.signal}</strong></div>
                  <div className="metric"><span>Bucket</span><strong>{selectedSecurity.maturity_bucket ?? "N/A"}</strong></div>
                  <div className="metric"><span>Latest Trade</span><strong>{selectedSecurity.latest_trade_date ?? "N/A"}</strong></div>
                  <div className="metric"><span>Latest Yield</span><strong>{formatNumber(selectedSecurity.latest_yield, "%")}</strong></div>
                  <div className="metric"><span>Latest Price</span><strong>{formatNumber(selectedSecurity.latest_price)}</strong></div>
                  <div className="metric"><span>Spread</span><strong>{formatNumber(selectedSecurity.spread_to_benchmark_bps, " bps")}</strong></div>
                  <div className="metric"><span>Total Par</span><strong>{selectedSecurity.total_trade_amount.toLocaleString()}</strong></div>
                </div>
                <div className="readthrough-list">
                  {selectedSecurity.readthrough.map((item) => <p key={item}>{item}</p>)}
                </div>
                <MiniTable<SecurityTradePoint>
                  rows={selectedSecurity.trades.slice(-20).reverse()}
                  columns={[
                    { key: "date", header: "Date", render: (row) => row.date },
                    { key: "side", header: "Side", render: (row) => row.trade_type },
                    { key: "yield", header: "Yield", render: (row) => formatNumber(row.yield, "%") },
                    { key: "price", header: "Price", render: (row) => formatNumber(row.price) },
                    { key: "spread", header: "Spread", render: (row) => formatNumber(row.spread_bps, " bps") },
                    { key: "par", header: "Par", render: (row) => row.trade_amount.toLocaleString() }
                  ]}
                />
              </div>
            ) : (
              <div className="empty-state small">No security detail available.</div>
            )}
          </article>

          <article className="panel">
            <div className="toolbar">
              <div>
                <h2>Watchlist / Saved Candidates</h2>
                <span className="table-count">{watchlistRows.length.toLocaleString()} saved</span>
              </div>
              <div className="button-row">
                {watchlistCsvHref ? (
                  <a className="secondary-button" href={watchlistCsvHref} download="watchlist.csv">
                    Watchlist CSV
                  </a>
                ) : null}
                <button className="secondary-button" type="button" onClick={() => setWatchlist([])}>
                  Clear
                </button>
              </div>
            </div>
            <MiniTable
              rows={watchlistRows}
              columns={[
                { key: "cusip", header: "CUSIP", render: (row) => row.cusip },
                { key: "issuer", header: "Issuer", render: (row) => row.issuer },
                { key: "signal", header: "Signal", render: (row) => row.signal },
                { key: "spread", header: "Spread", render: (row) => formatNumber(row.spread_to_benchmark_bps, " bps") },
                { key: "liq", header: "Liquidity", render: (row) => formatNumber(row.liquidity_score) },
                { key: "rv", header: "RV", render: (row) => formatNumber(row.rv_score) }
              ]}
            />
          </article>
        </section>
      ) : null}

      {payload && dashboard ? (
        <section className="parity-band final-band">
          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>Recommendation Narrative Engine</h2>
                <p>Rule-based narrative generated from calculated dashboard evidence.</p>
              </div>
            </div>
            <div className="methodology-block">
              <strong>{dashboard.recommendation.label}</strong>
              <p>{dashboard.recommendation.summary}</p>
            </div>
            <div className="split-list">
              <div>
                <h3>Drivers</h3>
                {dashboard.recommendation.drivers.map((item) => <p key={item}>{item}</p>)}
              </div>
              <div>
                <h3>Caveats</h3>
                {dashboard.recommendation.caveats.map((item) => <p key={item}>{item}</p>)}
              </div>
            </div>
            <details className="developer-payload" open>
              <summary>AI Context Package</summary>
              <pre className="json-block small">{JSON.stringify(dashboard.analyst_context, null, 2)}</pre>
            </details>
          </article>

          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>Export / Admin / Methodology</h2>
                <p>Report summary, benchmark policy, module status, and version log.</p>
              </div>
            </div>
            <div className="methodology-block">
              <strong>{dashboard.admin.methodology_version}</strong>
              <p>{dashboard.admin.benchmark_policy}</p>
            </div>
            <details className="developer-payload">
              <summary>Benchmark Audit</summary>
              <MiniTable<BenchmarkAuditRow>
                rows={dashboard.benchmark_audit.slice(0, 40)}
                columns={[
                  { key: "date", header: "Date", render: (row) => row.date },
                  { key: "tenor", header: "Tenor", render: (row) => row.tenor },
                  { key: "yield", header: "Yield", render: (row) => formatNumber(row.benchmark_yield, "%") },
                  { key: "source", header: "Source", render: (row) => row.benchmark_source },
                  { key: "n", header: "Obs", render: (row) => row.observation_count.toLocaleString() }
                ]}
              />
            </details>
            <details className="developer-payload">
              <summary>Methodology Sections</summary>
              <div className="methodology-list">
                {dashboard.methodology_sections.map((section) => (
                  <div key={section.title}>
                    <strong>{section.title}</strong>
                    <p>{section.body}</p>
                  </div>
                ))}
              </div>
            </details>
            <MiniTable
              rows={dashboard.admin.module_status}
              columns={[
                { key: "module", header: "Module", render: (row) => row.module },
                { key: "status", header: "Status", render: (row) => row.status },
                { key: "notes", header: "Notes", render: (row) => row.notes }
              ]}
            />
          </article>
        </section>
      ) : null}
    </main>
  );
}
