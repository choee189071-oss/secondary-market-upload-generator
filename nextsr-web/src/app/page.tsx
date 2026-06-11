"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  ActivityPoint,
  CurvePoint,
  DashboardAnalytics,
  NextsrPayload,
  PayloadValidation,
  PositionPoint,
  SecurityCandidate,
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

function IssuerCurveChart({ data }: { data: CurvePoint[] }) {
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
      <polyline className="line benchmark" points={linePath(data, x, (point) => y(point.benchmark_yield))} />
      <polyline className="line issuer" points={linePath(data, x, (point) => y(point.issuer_yield))} />
      {data.filter((point) => point.issuer_yield !== null).map((point) => (
        <circle className="dot issuer-dot" cx={x(point)} cy={y(point.issuer_yield) ?? 0} key={point.maturity_bucket} r="3.4" />
      ))}
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
            <rect className="bar activity" height={height} width={Math.max(8, barWidth - 8)} x={x} y={230 - height} />
            {index % 2 === 0 ? <text className="axis-label" x={x + barWidth / 2} y="254" textAnchor="middle">{point.month.slice(5)}</text> : null}
          </g>
        );
      })}
      <text className="axis-label" x="10" y="36">{max.toLocaleString()} trades</text>
    </svg>
  );
}

function PositioningChart({ data }: { data: PositionPoint[] }) {
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
          className={point.signal.includes("Wide") ? "bubble hot" : "bubble"}
          cx={x(point.liquidity_score)}
          cy={y(point.spread_bps)}
          key={point.cusip}
          r={Math.max(4, Math.min(13, Math.sqrt(point.total_trade_amount || 1) / 850))}
        />
      ))}
      <text className="axis-label" x="42" y="324">Liquidity 0</text>
      <text className="axis-label" x="758" y="324" textAnchor="end">Liquidity 100</text>
    </svg>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
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
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Select a CSV or Excel trade file.");
      return;
    }

    setError("");
    setIsLoading(true);
    setPayload(null);
    setValidation(null);
    setCandidates([]);
    setDashboard(null);

    const formData = new FormData();
    formData.set("file", file);
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
              <label htmlFor="trade-file">Trade File</label>
              <input
                id="trade-file"
                accept=".csv,.xlsx,.xls,text/csv"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="field">
              <label htmlFor="issuer">Issuer</label>
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
              {isLoading ? "Generating..." : "Generate Payload"}
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
              <a className="secondary-button" href={downloadHref} download="nextsr_payload.json">
                Download JSON
              </a>
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
        <section className="visual-grid">
          <article className="panel chart-panel wide">
            <div className="chart-header">
              <div>
                <h2>{payload.issuer} Issuer Curve vs Benchmark</h2>
                <p>Average issuer yield by maturity bucket over the selected lookback window.</p>
              </div>
              <div className="legend">
                <span><i className="legend-dot issuer-key" />Issuer</span>
                <span><i className="legend-dot benchmark-key" />Benchmark</span>
              </div>
            </div>
            <IssuerCurveChart data={dashboard.issuer_curve} />
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
            <PositioningChart data={dashboard.positioning} />
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
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((candidate) => (
                    <tr key={candidate.cusip}>
                      <td>{candidate.signal}</td>
                      <td>{candidate.cusip}</td>
                      <td>{candidate.maturity_bucket ?? "N/A"}</td>
                      <td>{formatNumber(candidate.spread_to_benchmark_bps, " bps")}</td>
                      <td>{formatNumber(candidate.liquidity_score)}</td>
                      <td>{formatNumber(candidate.rv_score)}</td>
                      <td>{candidate.trade_count.toLocaleString()}</td>
                      <td>{candidate.total_trade_amount.toLocaleString()}</td>
                      <td>{candidate.latest_trade_date ?? "N/A"}</td>
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
    </main>
  );
}
