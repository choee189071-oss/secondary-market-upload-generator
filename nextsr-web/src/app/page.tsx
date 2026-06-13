"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from "react";
import { buildPdfReportBlob, buildPptxReportBlob, downloadBlob } from "@/lib/clientExports";
import type {
  ActivityPoint,
  BenchmarkAuditRow,
  ChartReferenceLine,
  CrossIssuerRvPoint,
  CurvePoint,
  CurveShapeMetric,
  DashboardAnalytics,
  DealerProxyPoint,
  DistributionPoint,
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
  StreamlitParityAuditItem,
  TopCusipActivityPoint,
  TrendPoint
} from "@/lib/nextsrPayload";

const maturityBuckets = ["", ...Array.from({ length: 40 }, (_, index) => `${index + 1}Y`)];
const lookbackOptions = [7, 30, 60, 90, 180, 365];
const validationOrder = ["cusip", "trade_date", "yield", "maturity", "trade_amount", "index_rate", "spread", "trade_type", "price", "ratings"];
const maxUiFileBytes = 25 * 1024 * 1024;
const maxUiBundleBytes = 80 * 1024 * 1024;
const templateDownloads = [
  {
    label: "Trade Template",
    file: "nextsr_trade_template.csv",
    csv: "cusip,trade_date,yield,maturity_date,trade_amount,index,index_rate,spread,trade_type,price,rating\n123456AB9,2026-05-12,4.25,2056-05-01,1000000,30Y,4.00,25.0,Buy,100.25,AA\n"
  },
  {
    label: "Bond Reference",
    file: "nextsr_bond_reference_template.csv",
    csv: "cusip,issuer,sector,primary_type,description,maturity_date,coupon\n123456AB9,LADWP,Water & Power,Revenue,LADWP 5.00 2056,2056-05-01,5.00\n"
  },
  {
    label: "Issuer Mapping",
    file: "nextsr_issuer_mapping_template.csv",
    csv: "issuer,sector,primary_type\nLADWP,Water & Power,Revenue\n"
  },
  {
    label: "AAA MMD Benchmark",
    file: "nextsr_aaa_mmd_benchmark_template.csv",
    csv: "date,1Y,2Y,5Y,10Y,20Y,30Y\n2026-05-12,2.90,2.95,3.10,3.35,3.75,4.00\n"
  }
].map((item) => ({
  ...item,
  href: `data:text/csv;charset=utf-8,${encodeURIComponent(item.csv)}`
}));

const methodologyChangelog = [
  { version: "nextsr-methodology.v5", change: "Confirmed uploaded MMD is the AAA MMD curve, so issuer spreads are presented versus AAA MMD with rating/liquidity/callable/sector effects shown separately." },
  { version: "nextsr-methodology.v4", change: "Set uploaded MMD as primary benchmark, moved Trade Index to fallback, kept AI rule-based, and separated rating/liquidity/callable/sector attribution components." },
  { version: "nextsr-parity.v3", change: "Added template downloads, workspace reset, data quality scorecard, liquidity distributions, curve spread mode, and drilldown history panels." },
  { version: "nextsr-parity.v2", change: "Added Streamlit parity audit, desk snapshot, commentary studio, report center, and clearer workflow rail." },
  { version: "nextsr-parity.v1", change: "Ported upload engine, screener, issuer curve, spread trend, liquidity, RV positioning, watchlist, and core exports." }
];

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function formatPct(value: number | null | undefined) {
  return value === null || value === undefined ? "N/A" : `${value.toFixed(1)}%`;
}

function formatMillions(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return `$${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}

function nearestTenorLabel(bucket: string | null | undefined) {
  const year = Number(String(bucket ?? "").replace("Y", ""));
  if (!Number.isFinite(year) || year < 1) return null;
  if (year <= 2) return `${year}Y`;
  if (year <= 7) return "5Y";
  if (year <= 15) return "10Y";
  if (year <= 25) return "20Y";
  return "30Y";
}

function decisionLabel(row: CrossIssuerRvPoint | SecurityCandidate) {
  const spread = "avg_spread_bps" in row ? row.avg_spread_bps : row.spread_to_benchmark_bps;
  const liquidity = row.liquidity_score;
  const rv = row.rv_score;
  if ((spread ?? -Infinity) >= 25 && (liquidity ?? 0) >= 70 && (rv ?? 0) >= 70) return "Prioritize";
  if ((spread ?? -Infinity) >= 15 && (liquidity ?? 0) >= 45) return "Watch";
  if ((spread ?? Infinity) <= -10) return "Lower priority";
  return "Monitor";
}

function heatmapTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "empty";
  if (value >= 40) return "hot";
  if (value >= 20) return "warm";
  if (value <= -20) return "cool";
  return "neutral";
}

type ChartTooltip = {
  x: number;
  y: number;
  title: string;
  lines: string[];
};

function chartTooltipFromEvent(event: ReactMouseEvent<SVGElement>, title: string, lines: string[]): ChartTooltip {
  const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
  const rect = svg.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + 14,
    y: event.clientY - rect.top + 14,
    title,
    lines
  };
}

function TooltipOverlay({ tooltip }: { tooltip: ChartTooltip | null }) {
  if (!tooltip) {
    return null;
  }
  return (
    <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <strong>{tooltip.title}</strong>
      {tooltip.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
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

function BarMetricChart<T>({
  data,
  label,
  value,
  tone = "teal",
  activeLabel,
  onSelect
}: {
  data: T[];
  label: (point: T) => string;
  value: (point: T) => number | null;
  tone?: "teal" | "rose" | "blue";
  activeLabel?: string | null;
  onSelect?: (label: string) => void;
}) {
  const values = data.map(value).filter((item): item is number => item !== null && Number.isFinite(item));
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  if (!data.length || !values.length) {
    return <EmptyChart />;
  }
  const max = Math.max(...values.map((item) => Math.abs(item)), 1);
  const barWidth = 700 / data.length;
  return (
    <div className="chart-frame">
      <svg className="chart-svg compact" viewBox="0 0 800 280" role="img" onMouseLeave={() => setTooltip(null)}>
        <line className="grid-line" x1="42" x2="758" y1="230" y2="230" />
        {data.map((point, index) => {
          const rawValue = value(point) ?? 0;
          const height = (Math.abs(rawValue) / max) * 180;
          const x = 52 + index * barWidth;
          return (
            <g key={`${label(point)}-${index}`}>
              <rect
                className={`bar ${tone} ${label(point) === activeLabel ? "selected" : ""}`}
                height={height}
                width={Math.max(7, barWidth - 8)}
                x={x}
                y={230 - height}
                onClick={() => onSelect?.(label(point))}
                onMouseMove={(event) => setTooltip(chartTooltipFromEvent(event, label(point), [`Value: ${formatNumber(rawValue)}`]))}
              />
              {index % Math.ceil(data.length / 12 || 1) === 0 ? <text className="axis-label" x={x + barWidth / 2} y="254" textAnchor="middle">{label(point)}</text> : null}
            </g>
          );
        })}
        <text className="axis-label" x="10" y="36">{formatNumber(max)}</text>
      </svg>
      <TooltipOverlay tooltip={tooltip} />
    </div>
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

function AnalystReadthrough({
  title,
  quote,
  evidence = [],
  polish = []
}: {
  title: string;
  quote: string;
  evidence?: string[];
  polish?: string[];
}) {
  return (
    <div className="analyst-readthrough">
      <h3>{title}</h3>
      <div className="slide-quote"><strong>Slide-ready quote:</strong> {quote}</div>
      {evidence.length ? (
        <details className="readthrough-details">
          <summary>Evidence / calculation details</summary>
          <div className="readthrough-detail-list">
            {evidence.map((item) => <p key={item}>{item}</p>)}
          </div>
        </details>
      ) : null}
      {polish.length ? (
        <details className="readthrough-details">
          <summary>Narrative polish</summary>
          <div className="readthrough-detail-list">
            {polish.map((item) => <p key={item}>{item}</p>)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function IssuerCurveChart({
  data,
  mode = "yield",
  showIssuer = true,
  showBenchmark = true,
  activeBucket,
  onSelectBucket
}: {
  data: CurvePoint[];
  mode?: "yield" | "spread";
  showIssuer?: boolean;
  showBenchmark?: boolean;
  activeBucket?: string | null;
  onSelectBucket?: (bucket: string) => void;
}) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; point: CurvePoint; series: string } | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [brush, setBrush] = useState<{ startX: number; endX: number } | null>(null);
  const sortedData = useMemo(() => [...data].sort((a, b) => a.maturity_year - b.maturity_year), [data]);

  useEffect(() => {
    setZoomRange(null);
    setBrush(null);
    setCrosshair(null);
    setTooltip(null);
  }, [data, mode, showIssuer, showBenchmark]);

  const isSpreadMode = mode === "spread";
  const zoomStart = zoomRange?.[0] ?? 0;
  const plotData = zoomRange ? sortedData.slice(zoomRange[0], zoomRange[1] + 1) : sortedData;
  const values = plotData
    .flatMap((point) =>
      isSpreadMode
        ? [point.spread_bps]
        : [
            showIssuer ? point.issuer_yield : null,
            showBenchmark ? point.benchmark_yield : null
          ]
    )
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (!plotData.length || !values.length) {
    return <EmptyChart />;
  }
  const padding = isSpreadMode ? 5 : 0.15;
  const min = Math.min(...values) - padding;
  const max = Math.max(...values) + padding;
  const minYear = Math.min(...plotData.map((point) => point.maturity_year));
  const maxYear = Math.max(...plotData.map((point) => point.maturity_year));
  const x = (point: CurvePoint) => 42 + ((point.maturity_year - minYear) / (maxYear - minYear || 1)) * 716;
  const y = (value: number | null) => {
    if (value === null) return null;
    return 300 - ((value - min) / (max - min || 1)) * 244;
  };
  const svgXFromEvent = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = ((event.clientX - rect.left) / rect.width) * 800;
    return Math.max(42, Math.min(758, raw));
  };
  const svgYFromEvent = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return ((event.clientY - rect.top) / rect.height) * 340;
  };
  const indexFromSvgX = (svgX: number) => {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    plotData.forEach((point, index) => {
      const distance = Math.abs(x(point) - svgX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    return nearestIndex;
  };
  const visibleSeries = (point: CurvePoint) =>
    isSpreadMode
      ? point.spread_bps !== null
        ? [{ name: "Spread", value: point.spread_bps }]
        : []
      : [
          ...(showIssuer && point.issuer_yield !== null ? [{ name: "Issuer", value: point.issuer_yield }] : []),
          ...(showBenchmark && point.benchmark_yield !== null ? [{ name: "Benchmark", value: point.benchmark_yield }] : [])
        ];
  const updateCrosshair = (event: ReactMouseEvent<SVGSVGElement>) => {
    const index = indexFromSvgX(svgXFromEvent(event));
    const point = plotData[index];
    if (!point) return;
    const pointerY = svgYFromEvent(event);
    const series = visibleSeries(point).sort((a, b) => Math.abs((y(a.value) ?? 0) - pointerY) - Math.abs((y(b.value) ?? 0) - pointerY))[0];
    if (!series) return;
    const yy = y(series.value);
    if (yy === null) return;
    setCrosshair({ x: x(point), y: yy, point, series: series.name });
    setTooltip(chartTooltipFromEvent(event, `${point.maturity_bucket} ${series.name}`, [
      `Issuer yield: ${formatNumber(point.issuer_yield, "%")}`,
      `Benchmark yield: ${formatNumber(point.benchmark_yield, "%")}`,
      `Spread: ${formatNumber(point.spread_bps, " bps")}`,
      `Trades: ${point.trade_count.toLocaleString()}`,
      `Total par: ${point.total_trade_amount.toLocaleString()}`
    ]));
  };
  const commitBrush = () => {
    if (!brush) return;
    const left = Math.min(brush.startX, brush.endX);
    const right = Math.max(brush.startX, brush.endX);
    if (right - left < 12) {
      setBrush(null);
      return;
    }
    const startIndex = indexFromSvgX(left);
    const endIndex = indexFromSvgX(right);
    if (endIndex - startIndex < 1) {
      setBrush(null);
      return;
    }
    setZoomRange([zoomStart + startIndex, zoomStart + endIndex]);
    setBrush(null);
  };
  const maturityTicks = plotData.filter((_, index) => index % Math.ceil(plotData.length / 8 || 1) === 0 || index === plotData.length - 1);

  return (
    <div className="chart-frame">
      {zoomRange ? (
        <button className="chart-reset-button" type="button" onClick={() => setZoomRange(null)}>
          Reset zoom
        </button>
      ) : null}
      <svg
        className="chart-svg brushable"
        viewBox="0 0 800 340"
        role="img"
        onMouseDown={(event) => {
          const startX = svgXFromEvent(event);
          setBrush({ startX, endX: startX });
          updateCrosshair(event);
        }}
        onMouseMove={(event) => {
          if (brush) {
            setBrush((current) => (current ? { ...current, endX: svgXFromEvent(event) } : current));
          }
          updateCrosshair(event);
        }}
        onMouseUp={commitBrush}
        onMouseLeave={() => {
          setTooltip(null);
          setCrosshair(null);
          setBrush(null);
        }}
      >
        {[0, 1, 2, 3].map((tick) => {
          const yy = 300 - tick * 70;
          const label = min + ((max - min) * tick) / 3;
          return (
            <g key={tick}>
              <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
              <text className="axis-label" x="10" y={yy + 4}>{isSpreadMode ? label.toFixed(0) : `${label.toFixed(2)}%`}</text>
            </g>
          );
        })}
        {brush ? (
          <rect
            className="brush-window"
            x={Math.min(brush.startX, brush.endX)}
            y="56"
            width={Math.abs(brush.endX - brush.startX)}
            height="244"
          />
        ) : null}
        {isSpreadMode ? <line className="zero-line" x1="42" x2="758" y1={y(0) ?? 300} y2={y(0) ?? 300} /> : null}
        {isSpreadMode ? <polyline className="line spread" points={linePath(plotData, x, (point) => y(point.spread_bps))} /> : null}
        {!isSpreadMode && showBenchmark ? <polyline className="line benchmark" points={linePath(plotData, x, (point) => y(point.benchmark_yield))} /> : null}
        {!isSpreadMode && showIssuer ? <polyline className="line issuer" points={linePath(plotData, x, (point) => y(point.issuer_yield))} /> : null}
        {crosshair ? (
          <g className="crosshair">
            <line x1={crosshair.x} x2={crosshair.x} y1="56" y2="300" />
            <line x1="42" x2="758" y1={crosshair.y} y2={crosshair.y} />
            <circle className={crosshair.series === "Benchmark" ? "benchmark-focus" : undefined} cx={crosshair.x} cy={crosshair.y} r="5" />
          </g>
        ) : null}
        {!isSpreadMode && showBenchmark
          ? plotData.filter((point) => point.benchmark_yield !== null).map((point) => (
              <circle
                className={`dot benchmark-dot ${point.maturity_bucket === activeBucket ? "selected" : ""}`}
                cx={x(point)}
                cy={y(point.benchmark_yield) ?? 0}
                key={`${point.maturity_bucket}-benchmark`}
                onClick={() => onSelectBucket?.(point.maturity_bucket)}
                r="3.2"
              />
            ))
          : null}
        {isSpreadMode
          ? plotData.filter((point) => point.spread_bps !== null).map((point) => (
              <circle
                className={`dot issuer-dot ${point.maturity_bucket === activeBucket ? "selected" : ""}`}
                cx={x(point)}
                cy={y(point.spread_bps) ?? 0}
                key={`${point.maturity_bucket}-spread`}
                onClick={() => onSelectBucket?.(point.maturity_bucket)}
                r="3.4"
              />
            ))
          : null}
        {!isSpreadMode && showIssuer
          ? plotData.filter((point) => point.issuer_yield !== null).map((point) => (
              <circle
                className={`dot issuer-dot ${point.maturity_bucket === activeBucket ? "selected" : ""}`}
                cx={x(point)}
                cy={y(point.issuer_yield) ?? 0}
                key={point.maturity_bucket}
                onClick={() => onSelectBucket?.(point.maturity_bucket)}
                r="3.4"
              />
            ))
          : null}
        {maturityTicks.map((point) => (
          <text className="axis-label" key={`${point.maturity_bucket}-${point.maturity_year}`} x={x(point)} y="324" textAnchor="middle">{point.maturity_bucket}</text>
        ))}
      </svg>
      <TooltipOverlay tooltip={tooltip} />
    </div>
  );
}

function referenceLineClass(tone: ChartReferenceLine["tone"]) {
  return `reference-line ${tone}`;
}

function SpreadTrendChart({ data, referenceLines = [] }: { data: TrendPoint[]; referenceLines?: ChartReferenceLine[] }) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; point: TrendPoint } | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [brush, setBrush] = useState<{ startX: number; endX: number } | null>(null);

  useEffect(() => {
    setZoomRange(null);
    setBrush(null);
    setCrosshair(null);
    setTooltip(null);
  }, [data]);

  if (data.length < 2) {
    return <EmptyChart />;
  }

  const zoomStart = zoomRange?.[0] ?? 0;
  const plotData = zoomRange ? data.slice(zoomRange[0], zoomRange[1] + 1) : data;
  const referenceValues = referenceLines.map((line) => line.value_bps).filter((value) => Number.isFinite(value));
  const values = [...plotData.map((point) => point.spread_bps), ...referenceValues];
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const x = (_point: TrendPoint, index: number) => 42 + (index / Math.max(plotData.length - 1, 1)) * 716;
  const y = (value: number) => 300 - ((value - min) / (max - min || 1)) * 244;

  const svgXFromEvent = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = ((event.clientX - rect.left) / rect.width) * 800;
    return Math.max(42, Math.min(758, raw));
  };

  const indexFromSvgX = (svgX: number) => {
    const ratio = (svgX - 42) / 716;
    return Math.max(0, Math.min(plotData.length - 1, Math.round(ratio * (plotData.length - 1))));
  };

  const updateCrosshair = (event: ReactMouseEvent<SVGSVGElement>) => {
    const svgX = svgXFromEvent(event);
    const index = indexFromSvgX(svgX);
    const point = plotData[index];
    if (!point) return;
    setCrosshair({ x: x(point, index), y: y(point.spread_bps), point });
    setTooltip(chartTooltipFromEvent(event, point.date, [
      `Spread: ${formatNumber(point.spread_bps, " bps")}`,
      `Avg yield: ${formatNumber(point.avg_yield, "%")}`,
      `Benchmark: ${formatNumber(point.benchmark_yield, "%")}`,
      `Trades: ${point.trade_count.toLocaleString()}`
    ]));
  };

  const commitBrush = () => {
    if (!brush) return;
    const left = Math.min(brush.startX, brush.endX);
    const right = Math.max(brush.startX, brush.endX);
    if (right - left < 12) {
      setBrush(null);
      return;
    }
    const startIndex = indexFromSvgX(left);
    const endIndex = indexFromSvgX(right);
    if (endIndex - startIndex < 1) {
      setBrush(null);
      return;
    }
    setZoomRange([zoomStart + startIndex, zoomStart + endIndex]);
    setBrush(null);
  };

  return (
    <div className="chart-frame">
      {zoomRange ? (
        <button className="chart-reset-button" type="button" onClick={() => setZoomRange(null)}>
          Reset zoom
        </button>
      ) : null}
      <svg
        className="chart-svg brushable"
        viewBox="0 0 800 340"
        role="img"
        onMouseDown={(event) => {
          const startX = svgXFromEvent(event);
          setBrush({ startX, endX: startX });
          updateCrosshair(event);
        }}
        onMouseMove={(event) => {
          if (brush) {
            setBrush((current) => (current ? { ...current, endX: svgXFromEvent(event) } : current));
          }
          updateCrosshair(event);
        }}
        onMouseUp={commitBrush}
        onMouseLeave={() => {
          setTooltip(null);
          setCrosshair(null);
          setBrush(null);
        }}
      >
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
        {brush ? (
          <rect
            className="brush-window"
            x={Math.min(brush.startX, brush.endX)}
            y="56"
            width={Math.abs(brush.endX - brush.startX)}
            height="244"
          />
        ) : null}
        <line className="zero-line" x1="42" x2="758" y1={y(0)} y2={y(0)} />
        {referenceLines.map((line, index) => {
          const yy = y(line.value_bps);
          return (
            <g key={line.id}>
              <line className={referenceLineClass(line.tone)} x1="42" x2="758" y1={yy} y2={yy} />
              <text className="reference-label" x="752" y={yy - 5 - (index % 2) * 10} textAnchor="end">
                {line.label} {line.value_bps.toFixed(1)} bps
              </text>
            </g>
          );
        })}
        <polyline className="line spread" points={linePath(plotData, x, (point) => y(point.spread_bps))} />
        {crosshair ? (
          <g className="crosshair">
            <line x1={crosshair.x} x2={crosshair.x} y1="56" y2="300" />
            <line x1="42" x2="758" y1={crosshair.y} y2={crosshair.y} />
            <circle cx={crosshair.x} cy={crosshair.y} r="5" />
          </g>
        ) : null}
        {plotData.map((point, index) => (
          <circle
            className="dot issuer-dot"
            cx={x(point, index)}
            cy={y(point.spread_bps)}
            key={`${point.date}-${index}`}
            r="3"
            onMouseMove={(event) => setTooltip(chartTooltipFromEvent(event, point.date, [
              `Spread: ${formatNumber(point.spread_bps, " bps")}`,
              `Avg yield: ${formatNumber(point.avg_yield, "%")}`,
              `Benchmark: ${formatNumber(point.benchmark_yield, "%")}`,
              `Trades: ${point.trade_count.toLocaleString()}`
            ]))}
          />
        ))}
        <text className="axis-label" x="42" y="324">{plotData[0].date}</text>
        <text className="axis-label" x="758" y="324" textAnchor="end">{plotData[plotData.length - 1].date}</text>
      </svg>
      <TooltipOverlay tooltip={tooltip} />
    </div>
  );
}

function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  if (!data.length) {
    return <EmptyChart />;
  }
  const max = Math.max(...data.map((point) => point.trade_count), 1);
  const barWidth = 700 / data.length;
  return (
    <div className="chart-frame">
      <svg className="chart-svg" viewBox="0 0 800 280" role="img" onMouseLeave={() => setTooltip(null)}>
        <line className="grid-line" x1="42" x2="758" y1="230" y2="230" />
        {data.map((point, index) => {
          const height = (point.trade_count / max) * 190;
          const x = 52 + index * barWidth;
          return (
            <g key={point.month}>
              <rect
                className="bar activity"
                height={height}
                width={Math.max(8, barWidth - 8)}
                x={x}
                y={230 - height}
                onMouseMove={(event) => setTooltip(chartTooltipFromEvent(event, point.month, [
                  `Trades: ${point.trade_count.toLocaleString()}`,
                  `Total par: ${point.total_trade_amount.toLocaleString()}`
                ]))}
              />
              {index % 2 === 0 ? <text className="axis-label" x={x + barWidth / 2} y="254" textAnchor="middle">{point.month.slice(5)}</text> : null}
            </g>
          );
        })}
        <text className="axis-label" x="10" y="36">{max.toLocaleString()} trades</text>
      </svg>
      <TooltipOverlay tooltip={tooltip} />
    </div>
  );
}

function PositioningChart({
  data,
  selectedCusip,
  yAxis = "spread",
  onSelect
}: {
  data: PositionPoint[];
  selectedCusip?: string;
  yAxis?: "spread" | "yield";
  onSelect?: (cusip: string) => void;
}) {
  const yMetric = (point: PositionPoint) => (yAxis === "yield" ? point.avg_yield : point.spread_bps);
  const points = data.filter((point) => yMetric(point) !== null && point.liquidity_score !== null);
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  if (!points.length) {
    return <EmptyChart />;
  }
  const yValues = points.map((point) => yMetric(point) ?? 0);
  const padding = yAxis === "yield" ? 0.15 : 5;
  const minValue = Math.min(...yValues) - padding;
  const maxValue = Math.max(...yValues) + padding;
  const ySuffix = yAxis === "yield" ? "%" : " bps";
  const x = (value: number | null) => 42 + ((value ?? 0) / 100) * 716;
  const y = (value: number | null) => 300 - (((value ?? 0) - minValue) / (maxValue - minValue || 1)) * 244;
  return (
    <div className="chart-frame">
      <svg className="chart-svg" viewBox="0 0 800 340" role="img" onMouseLeave={() => setTooltip(null)}>
        {[25, 50, 75].map((tick) => <line className="grid-line vertical" key={tick} x1={x(tick)} x2={x(tick)} y1="56" y2="300" />)}
        {[0, 1, 2, 3].map((tick) => {
          const yy = 300 - tick * 70;
          const label = minValue + ((maxValue - minValue) * tick) / 3;
          return (
            <g key={tick}>
              <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
              <text className="axis-label" x="8" y={yy + 4}>{yAxis === "yield" ? label.toFixed(2) : label.toFixed(0)}</text>
            </g>
          );
        })}
        {points.slice(0, 60).map((point) => (
          <circle
            className={`${point.signal.includes("Wide") ? "bubble hot" : "bubble"} ${point.cusip === selectedCusip ? "selected" : ""}`}
            cx={x(point.liquidity_score)}
            cy={y(yMetric(point))}
            key={point.cusip}
            onClick={() => onSelect?.(point.cusip)}
            onMouseMove={(event) => setTooltip(chartTooltipFromEvent(event, point.cusip, [
              `Signal: ${point.signal}`,
              `Spread: ${formatNumber(point.spread_bps, " bps")}`,
              `Avg yield: ${formatNumber(point.avg_yield, "%")}`,
              `${yAxis === "yield" ? "Y-axis yield" : "Y-axis spread"}: ${formatNumber(yMetric(point), ySuffix)}`,
              `Liquidity: ${formatNumber(point.liquidity_score)}`,
              `RV score: ${formatNumber(point.rv_score)}`,
              `Total par: ${point.total_trade_amount.toLocaleString()}`
            ]))}
            r={Math.max(4, Math.min(13, Math.sqrt(point.total_trade_amount || 1) / 850))}
          />
        ))}
        <text className="axis-label" x="42" y="324">Liquidity 0</text>
        <text className="axis-label" x="758" y="324" textAnchor="end">Liquidity 100</text>
      </svg>
      <TooltipOverlay tooltip={tooltip} />
    </div>
  );
}

function SecurityTradePathChart({ trades }: { trades: SecurityTradePoint[] }) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; point: SecurityTradePoint; absoluteIndex: number } | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [brush, setBrush] = useState<{ startX: number; endX: number } | null>(null);
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number | null>(null);
  const sortedTrades = useMemo(
    () => [...trades]
      .filter((trade) => trade.spread_bps !== null || trade.yield !== null)
      .sort((a, b) => {
        const aTime = a.date ? new Date(`${a.date}T00:00:00Z`).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.date ? new Date(`${b.date}T00:00:00Z`).getTime() : Number.MAX_SAFE_INTEGER;
        return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER);
      }),
    [trades]
  );

  useEffect(() => {
    setZoomRange(null);
    setBrush(null);
    setCrosshair(null);
    setTooltip(null);
    setSelectedTradeIndex(null);
  }, [trades]);

  const hasSpread = sortedTrades.some((trade) => trade.spread_bps !== null);
  const metricLabel = hasSpread ? "Spread" : "Yield";
  const metricSuffix = hasSpread ? " bps" : "%";
  const metricValue = (trade: SecurityTradePoint) => (hasSpread ? trade.spread_bps : trade.yield);
  const zoomStart = zoomRange?.[0] ?? 0;
  const plotData = zoomRange ? sortedTrades.slice(zoomRange[0], zoomRange[1] + 1) : sortedTrades;
  const values = plotData.map(metricValue).filter((value): value is number => value !== null && Number.isFinite(value));

  if (plotData.length < 2 || !values.length) {
    return <EmptyChart />;
  }

  const padding = hasSpread ? 5 : 0.12;
  const min = Math.min(...values) - padding;
  const max = Math.max(...values) + padding;
  const maxPar = Math.max(...plotData.map((trade) => trade.trade_amount), 1);
  const x = (_point: SecurityTradePoint, index: number) => 42 + (index / Math.max(plotData.length - 1, 1)) * 716;
  const y = (value: number | null) => {
    if (value === null) return null;
    return 285 - ((value - min) / (max - min || 1)) * 229;
  };
  const sideClass = (trade: SecurityTradePoint) => {
    const side = (trade.trade_type ?? "").toLowerCase();
    if (side.includes("buy")) return "buy";
    if (side.includes("sell")) return "sell";
    return "other";
  };
  const svgXFromEvent = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = ((event.clientX - rect.left) / rect.width) * 800;
    return Math.max(42, Math.min(758, raw));
  };
  const indexFromSvgX = (svgX: number) => {
    const ratio = (svgX - 42) / 716;
    return Math.max(0, Math.min(plotData.length - 1, Math.round(ratio * (plotData.length - 1))));
  };
  const updateCrosshair = (event: ReactMouseEvent<SVGSVGElement>) => {
    const index = indexFromSvgX(svgXFromEvent(event));
    const point = plotData[index];
    if (!point) return;
    const yy = y(metricValue(point));
    if (yy === null) return;
    const absoluteIndex = zoomStart + index;
    setCrosshair({ x: x(point, index), y: yy, point, absoluteIndex });
    setTooltip(chartTooltipFromEvent(event, point.date ?? "Undated trade", [
      `${metricLabel}: ${formatNumber(metricValue(point), metricSuffix)}`,
      `Yield: ${formatNumber(point.yield, "%")}`,
      `Benchmark: ${formatNumber(point.benchmark_yield, "%")}`,
      `Price: ${formatNumber(point.price)}`,
      `Par: ${point.trade_amount.toLocaleString()}`,
      `Side: ${point.trade_type ?? "N/A"}`
    ]));
  };
  const commitBrush = () => {
    if (!brush) return;
    const left = Math.min(brush.startX, brush.endX);
    const right = Math.max(brush.startX, brush.endX);
    const nearestIndex = indexFromSvgX(brush.endX);
    if (right - left < 12) {
      setSelectedTradeIndex(zoomStart + nearestIndex);
      setBrush(null);
      return;
    }
    const startIndex = indexFromSvgX(left);
    const endIndex = indexFromSvgX(right);
    if (endIndex - startIndex < 1) {
      setBrush(null);
      return;
    }
    setZoomRange([zoomStart + startIndex, zoomStart + endIndex]);
    setSelectedTradeIndex(zoomStart + startIndex);
    setBrush(null);
  };
  const barWidth = Math.max(3, Math.min(22, 650 / plotData.length));
  const selectedTrade = selectedTradeIndex !== null ? sortedTrades[selectedTradeIndex] ?? null : null;

  return (
    <div className="trade-path-block">
      <div className="chart-frame">
        {zoomRange ? (
          <button className="chart-reset-button" type="button" onClick={() => setZoomRange(null)}>
            Reset zoom
          </button>
        ) : null}
        <svg
          className="chart-svg brushable"
          viewBox="0 0 800 380"
          role="img"
          onMouseDown={(event) => {
            const startX = svgXFromEvent(event);
            setBrush({ startX, endX: startX });
            updateCrosshair(event);
          }}
          onMouseMove={(event) => {
            if (brush) {
              setBrush((current) => (current ? { ...current, endX: svgXFromEvent(event) } : current));
            }
            updateCrosshair(event);
          }}
          onMouseUp={commitBrush}
          onMouseLeave={() => {
            setTooltip(null);
            setCrosshair(null);
            setBrush(null);
          }}
        >
          {[0, 1, 2, 3].map((tick) => {
            const yy = 285 - tick * 64;
            const label = min + ((max - min) * tick) / 3;
            return (
              <g key={tick}>
                <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
                <text className="axis-label" x="8" y={yy + 4}>{formatNumber(label, metricSuffix)}</text>
              </g>
            );
          })}
          {brush ? (
            <rect
              className="brush-window"
              x={Math.min(brush.startX, brush.endX)}
              y="56"
              width={Math.abs(brush.endX - brush.startX)}
              height="274"
            />
          ) : null}
          {plotData.map((trade, index) => {
            const height = Math.max(2, (trade.trade_amount / maxPar) * 36);
            return (
              <rect
                className={`trade-volume-bar ${sideClass(trade)}`}
                height={height}
                key={`${trade.date ?? "undated"}-${index}-bar`}
                width={barWidth}
                x={x(trade, index) - barWidth / 2}
                y={330 - height}
              />
            );
          })}
          <polyline className="line spread" points={linePath(plotData, x, (trade) => y(metricValue(trade)))} />
          {crosshair ? (
            <g className="crosshair">
              <line x1={crosshair.x} x2={crosshair.x} y1="56" y2="330" />
              <line x1="42" x2="758" y1={crosshair.y} y2={crosshair.y} />
              <circle cx={crosshair.x} cy={crosshair.y} r="5" />
            </g>
          ) : null}
          {plotData.map((trade, index) => {
            const metric = metricValue(trade);
            const yy = y(metric);
            if (yy === null) return null;
            const absoluteIndex = zoomStart + index;
            return (
              <circle
                className={`trade-dot ${sideClass(trade)} ${absoluteIndex === selectedTradeIndex ? "selected" : ""}`}
                cx={x(trade, index)}
                cy={yy}
                key={`${trade.date ?? "undated"}-${index}-dot`}
                onClick={() => setSelectedTradeIndex(absoluteIndex)}
                r={absoluteIndex === selectedTradeIndex ? 5.4 : 3.8}
              />
            );
          })}
          <text className="axis-label" x="42" y="358">{plotData[0].date ?? "Undated"}</text>
          <text className="axis-label" x="758" y="358" textAnchor="end">{plotData[plotData.length - 1].date ?? "Undated"}</text>
        </svg>
        <TooltipOverlay tooltip={tooltip} />
      </div>
      {selectedTrade ? (
        <div className="selected-trade-card">
          <span>{selectedTrade.date ?? "Undated trade"}</span>
          <strong>{formatNumber(metricValue(selectedTrade), metricSuffix)}</strong>
          <span>Yield {formatNumber(selectedTrade.yield, "%")}</span>
          <span>Price {formatNumber(selectedTrade.price)}</span>
          <span>Par {selectedTrade.trade_amount.toLocaleString()}</span>
          <span>{selectedTrade.trade_type ?? "N/A"}</span>
        </div>
      ) : null}
    </div>
  );
}

function SecurityMiniHistoryChart({ trades, metric }: { trades: SecurityTradePoint[]; metric: "yield" | "amount" }) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const sortedTrades = [...trades]
    .filter((trade) => metric === "yield" ? trade.yield !== null : trade.trade_amount > 0)
    .sort((a, b) => {
      const aTime = a.date ? new Date(`${a.date}T00:00:00Z`).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.date ? new Date(`${b.date}T00:00:00Z`).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  if (sortedTrades.length < 2) {
    return <EmptyChart />;
  }
  const value = (trade: SecurityTradePoint) => (metric === "yield" ? trade.yield : trade.trade_amount);
  const values = sortedTrades.map(value).filter((item): item is number => item !== null && Number.isFinite(item));
  if (!values.length) {
    return <EmptyChart />;
  }
  const min = metric === "yield" ? Math.min(...values) - 0.12 : 0;
  const max = Math.max(...values) + (metric === "yield" ? 0.12 : Math.max(...values) * 0.08);
  const x = (_point: SecurityTradePoint, index: number) => 42 + (index / Math.max(sortedTrades.length - 1, 1)) * 716;
  const y = (raw: number | null) => {
    if (raw === null) return null;
    return 230 - ((raw - min) / (max - min || 1)) * 174;
  };
  return (
    <div className="chart-frame mini-history">
      <svg className="chart-svg compact" viewBox="0 0 800 280" role="img" onMouseLeave={() => setTooltip(null)}>
        {[0, 1, 2].map((tick) => {
          const yy = 230 - tick * 72;
          const label = min + ((max - min) * tick) / 2;
          return (
            <g key={tick}>
              <line className="grid-line" x1="42" x2="758" y1={yy} y2={yy} />
              <text className="axis-label" x="8" y={yy + 4}>{metric === "yield" ? `${label.toFixed(2)}%` : label.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
            </g>
          );
        })}
        {metric === "yield" ? (
          <polyline className="line issuer" points={linePath(sortedTrades, x, (trade) => y(value(trade)))} />
        ) : (
          sortedTrades.map((trade, index) => {
            const barHeight = 230 - (y(value(trade)) ?? 230);
            const barWidth = Math.max(4, Math.min(24, 650 / sortedTrades.length));
            return (
              <rect
                className="bar activity"
                height={barHeight}
                key={`${trade.date ?? "undated"}-${index}`}
                width={barWidth}
                x={x(trade, index) - barWidth / 2}
                y={230 - barHeight}
              />
            );
          })
        )}
        {sortedTrades.map((trade, index) => {
          const yy = y(value(trade));
          if (yy === null) return null;
          return (
            <circle
              className="dot issuer-dot"
              cx={x(trade, index)}
              cy={yy}
              key={`${trade.date ?? "undated"}-${index}-point`}
              onMouseMove={(event) => setTooltip(chartTooltipFromEvent(event, trade.date ?? "Undated trade", [
                metric === "yield" ? `Yield: ${formatNumber(trade.yield, "%")}` : `Par: ${trade.trade_amount.toLocaleString()}`,
                `Spread: ${formatNumber(trade.spread_bps, " bps")}`,
                `Price: ${formatNumber(trade.price)}`,
                `Side: ${trade.trade_type ?? "N/A"}`
              ]))}
              r="3"
            />
          );
        })}
        <text className="axis-label" x="42" y="258">{sortedTrades[0].date ?? "Undated"}</text>
        <text className="axis-label" x="758" y="258" textAnchor="end">{sortedTrades[sortedTrades.length - 1].date ?? "Undated"}</text>
      </svg>
      <TooltipOverlay tooltip={tooltip} />
    </div>
  );
}

export default function Home() {
  const [tradeFiles, setTradeFiles] = useState<File[]>([]);
  const [bondReference, setBondReference] = useState<File | null>(null);
  const [issuerMapping, setIssuerMapping] = useState<File | null>(null);
  const [mmdBenchmark, setMmdBenchmark] = useState<File | null>(null);
  const [issuer, setIssuer] = useState("");
  const [sectorOverride, setSectorOverride] = useState("");
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
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistNotes, setWatchlistNotes] = useState<Record<string, string>>({});
  const [curveMode, setCurveMode] = useState<"yield" | "spread">("yield");
  const [showIssuerCurve, setShowIssuerCurve] = useState(true);
  const [showBenchmarkCurve, setShowBenchmarkCurve] = useState(true);
  const [showReferenceLines, setShowReferenceLines] = useState(true);
  const [ratingCurveView, setRatingCurveView] = useState("AAA");
  const [positioningYAxis, setPositioningYAxis] = useState<"spread" | "yield">("spread");
  const [trendRange, setTrendRange] = useState("90");
  const [scenarioShockBps, setScenarioShockBps] = useState(25);
  const [candidateSort, setCandidateSort] = useState("rv_score");
  const [candidateLimit, setCandidateLimit] = useState(25);
  const [candidateView, setCandidateView] = useState("all");
  const [tableDensity, setTableDensity] = useState("compact");
  const [performanceMode, setPerformanceMode] = useState("standard");
  const [showDeveloperPayload, setShowDeveloperPayload] = useState(false);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [securitySearch, setSecuritySearch] = useState("");
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
    const saved = window.localStorage.getItem("nextsr-watchlist-notes");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setWatchlistNotes(
            Object.fromEntries(
              Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
            )
          );
        }
      } catch {
        setWatchlistNotes({});
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("nextsr-watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    window.localStorage.setItem("nextsr-watchlist-notes", JSON.stringify(watchlistNotes));
  }, [watchlistNotes]);

  useEffect(() => {
    if (payload?.maturity_bucket) {
      setActiveBucket(payload.maturity_bucket);
    }
  }, [payload?.maturity_bucket]);

  const jsonText = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ""), [payload]);
  const activeTrendSource = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    if (activeBucket && dashboard.linked_spread_trends[activeBucket]?.length) {
      return dashboard.linked_spread_trends[activeBucket];
    }
    return dashboard.spread_trend;
  }, [activeBucket, dashboard]);
  const visibleSpreadTrend = useMemo(() => {
    const source = activeTrendSource;
    if (trendRange === "all" || source.length < 2) {
      return source;
    }
    const days = Number(trendRange);
    const latest = new Date(`${source[source.length - 1].date}T00:00:00Z`);
    const cutoff = new Date(latest);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    return source.filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoff.getTime());
  }, [activeTrendSource, trendRange]);
  const visibleScenarioShock = useMemo(() => {
    if (!dashboard?.scenario_shock.length) {
      return [];
    }
    return dashboard.scenario_shock.map((point) => ({
      ...point,
      shock_bps: scenarioShockBps,
      approx_price_impact_pct: point.duration_proxy === null ? null : Math.round(((-point.duration_proxy * scenarioShockBps) / 100) * 100) / 100
    }));
  }, [dashboard, scenarioShockBps]);
  const filteredCandidates = useMemo(
    () => {
      const sortValue = (candidate: SecurityCandidate) => {
        if (candidateSort === "spread") return candidate.spread_to_benchmark_bps ?? -Infinity;
        if (candidateSort === "liquidity") return candidate.liquidity_score ?? -Infinity;
        if (candidateSort === "trades") return candidate.trade_count;
        if (candidateSort === "par") return candidate.total_trade_amount;
        if (candidateSort === "latest") return candidate.latest_trade_date ? new Date(`${candidate.latest_trade_date}T00:00:00Z`).getTime() : -Infinity;
        return candidate.rv_score ?? -Infinity;
      };
      const search = securitySearch.trim().toLowerCase();
      return candidates
        .filter((candidate) => (candidate.spread_to_benchmark_bps ?? -Infinity) >= minSpread)
        .filter((candidate) => (candidate.liquidity_score ?? -Infinity) >= minLiquidity)
        .filter((candidate) => candidate.trade_count >= minTrades)
        .filter((candidate) => (candidateView === "watchlist" ? watchlist.includes(candidate.cusip) : true))
        .filter((candidate) => (candidateView === "selected" ? candidate.cusip === selectedCusip : true))
        .filter((candidate) => (search ? `${candidate.cusip} ${candidate.issuer} ${candidate.signal}`.toLowerCase().includes(search) : true))
        .sort((a, b) => sortValue(b) - sortValue(a))
        .slice(0, candidateLimit);
    },
    [candidateLimit, candidateSort, candidateView, candidates, minLiquidity, minSpread, minTrades, securitySearch, selectedCusip, watchlist]
  );
  const topOpportunity = filteredCandidates[0] ?? candidates[0] ?? null;
  const opportunityQuadrants = useMemo(() => {
    const buckets = [
      { label: "Wide + Liquid", test: (row: SecurityCandidate) => (row.spread_to_benchmark_bps ?? -Infinity) >= 25 && (row.liquidity_score ?? 0) >= 70 },
      { label: "Wide / Check Liquidity", test: (row: SecurityCandidate) => (row.spread_to_benchmark_bps ?? -Infinity) >= 25 && (row.liquidity_score ?? 0) < 70 },
      { label: "Rich / Lower Priority", test: (row: SecurityCandidate) => (row.spread_to_benchmark_bps ?? Infinity) <= -10 },
      { label: "Monitor", test: (row: SecurityCandidate) => (row.spread_to_benchmark_bps ?? -Infinity) < 25 && (row.spread_to_benchmark_bps ?? Infinity) > -10 }
    ];
    return buckets.map((bucket) => {
      const rows = candidates.filter(bucket.test);
      return {
        label: bucket.label,
        count: rows.length,
        totalPar: rows.reduce((sum, row) => sum + row.total_trade_amount, 0),
        topCusip: rows.sort((a, b) => (b.rv_score ?? -Infinity) - (a.rv_score ?? -Infinity))[0]?.cusip ?? "N/A"
      };
    });
  }, [candidates]);
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
  const auditDataHref = useMemo(() => {
    const data = dashboard?.report_artifacts.audit_data_json;
    return data ? `data:application/json;charset=utf-8,${encodeURIComponent(data)}` : "";
  }, [dashboard]);
  const securityDetailHref = useMemo(() => {
    const data = dashboard?.report_artifacts.security_detail_csv;
    return data ? `data:text/csv;charset=utf-8,${encodeURIComponent(data)}` : "";
  }, [dashboard]);
  const benchmarkCsvHref = useMemo(() => {
    const data = dashboard?.report_artifacts.benchmark_csv;
    return data ? `data:text/csv;charset=utf-8,${encodeURIComponent(data)}` : "";
  }, [dashboard]);
  const pptOutlineHref = useMemo(() => {
    const data = dashboard?.report_artifacts.ppt_outline_markdown;
    return data ? `data:text/markdown;charset=utf-8,${encodeURIComponent(data)}` : "";
  }, [dashboard]);
  const reportManifestHref = useMemo(() => {
    const data = dashboard?.report_artifacts.report_manifest_json;
    return data ? `data:application/json;charset=utf-8,${encodeURIComponent(data)}` : "";
  }, [dashboard]);
  const parityAuditHref = useMemo(() => {
    const rows = dashboard?.streamlit_parity_audit ?? [];
    if (!rows.length) {
      return "";
    }
    const headers = ["area", "streamlit_surface", "source_anchor", "next_surface", "status", "priority", "notes", "next_step"];
    const csvRows = rows.map((row) => headers.map((header) => JSON.stringify(row[header as keyof StreamlitParityAuditItem] ?? "")).join(","));
    return `data:text/csv;charset=utf-8,${encodeURIComponent([headers.join(","), ...csvRows].join("\n"))}`;
  }, [dashboard]);
  const parityStats = useMemo(() => {
    const rows = dashboard?.streamlit_parity_audit ?? [];
    return rows.reduce<Record<StreamlitParityAuditItem["status"], number>>(
      (counts, item) => ({ ...counts, [item.status]: counts[item.status] + 1 }),
      { ported: 0, partial: 0, missing: 0, "next-enhanced": 0 }
    );
  }, [dashboard]);
  const selectedRatingAssumption = useMemo(() => {
    const rows = dashboard?.benchmark_governance.spread_assumptions ?? [];
    return rows.find((row) => row.rating === ratingCurveView) ?? rows[0] ?? null;
  }, [dashboard, ratingCurveView]);
  const methodologyLockRows = useMemo(() => {
    if (!payload || !dashboard) {
      return [];
    }
    return [
      {
        topic: "AAA MMD",
        status: dashboard.benchmark_governance.uploaded_mmd_points ? "Primary" : "Needs Upload",
        rule: "Uploaded MMD is treated as the AAA base curve. Trade Sheet Index / Index Rate is fallback only.",
        evidence: `${dashboard.benchmark_governance.uploaded_mmd_points.toLocaleString()} uploaded AAA MMD point(s); ${dashboard.benchmark_governance.fallback_points_used.toLocaleString()} fallback point(s).`
      },
      {
        topic: "Spread",
        status: "Locked",
        rule: "Spread equals issuer yield minus active benchmark yield, shown in basis points.",
        evidence: `Current selected spread is ${formatNumber(payload.signals.spread.current_spread_bps, " bps")}.`
      },
      {
        topic: "Rating",
        status: "Separated",
        rule: "Ratings support peer grouping and attribution. Rating assumptions are displayed, not embedded into the benchmark spread.",
        evidence: selectedRatingAssumption ? `${selectedRatingAssumption.rating}: AAA MMD + ${formatNumber(selectedRatingAssumption.spread_bps, " bps")}.` : "No rating assumption selected."
      },
      {
        topic: "Sector",
        status: "Fallback Peer Key",
        rule: "When issuer/rating coverage is thin, use sector plus maturity bucket for comparisons.",
        evidence: `${dashboard.data_health.issuers.toLocaleString()} issuer(s) and ${dashboard.data_health.cusips.toLocaleString()} CUSIP(s) in uploaded universe.`
      },
      {
        topic: "Liquidity",
        status: "Separate Score",
        rule: "Liquidity is scored from trade count, total par, and recency; it does not change benchmark spread.",
        evidence: `Selected-bucket liquidity score is ${formatNumber(payload.signals.liquidity.liquidity_score)}.`
      },
      {
        topic: "Callable",
        status: "Attribution Layer",
        rule: "Callable/structure effects should be shown as separate attribution when reference data is available.",
        evidence: dashboard.spread_attribution.find((row) => row.component.toLowerCase().includes("call"))?.detail ?? "No callable reference field detected in current upload."
      },
      {
        topic: "Peer RV",
        status: "Active",
        rule: "Compare selected issuer spread against same-bucket peer median and rank the gap separately.",
        evidence: `${dashboard.peer_rv.length.toLocaleString()} peer RV bucket row(s) generated.`
      },
      {
        topic: "Recommendation",
        status: "Rule-Based",
        rule: "Recommendations use explainable spread, liquidity, peer gap, and caveat rules. No OpenAI dependency is required.",
        evidence: dashboard.recommendation.summary
      }
    ];
  }, [dashboard, payload, selectedRatingAssumption]);
  const partialBuildQueue = useMemo(() => {
    const priorityRank: Record<StreamlitParityAuditItem["priority"], number> = { High: 0, Medium: 1, Low: 2 };
    return (dashboard?.streamlit_parity_audit ?? [])
      .filter((item) => item.status === "partial" || item.status === "missing")
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
      .slice(0, 8)
      .map((item, index) => ({
        order: index + 1,
        area: item.area,
        priority: item.priority,
        status: item.status,
        next_step: item.next_step
      }));
  }, [dashboard]);
  const rvDecisionRows = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    return [...dashboard.peer_rv]
      .sort((a, b) => Math.abs(b.peer_gap_bps ?? 0) - Math.abs(a.peer_gap_bps ?? 0))
      .slice(0, 12)
      .map((row) => ({
        ...row,
        decision:
          row.peer_gap_bps === null
            ? "Review"
            : row.peer_gap_bps >= 20
              ? "Cheap vs peers"
              : row.peer_gap_bps <= -15
                ? "Rich vs peers"
                : "In line",
        evidence: `${row.issuer_trade_count.toLocaleString()} issuer trade(s); ${row.peer_issuer_count.toLocaleString()} peer issuer(s).`
      }));
  }, [dashboard]);
  const crossIssuerMatrixRows = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    return [...dashboard.cross_issuer_rv]
      .sort((a, b) => (b.rv_score ?? -Infinity) - (a.rv_score ?? -Infinity))
      .slice(0, 12)
      .map((row) => ({
        ...row,
        decision: decisionLabel(row)
      }));
  }, [dashboard]);
  const selectedSecurity = useMemo(() => {
    if (!dashboard?.security_details.length) {
      return null;
    }
    return dashboard.security_details.find((item) => item.cusip === selectedCusip) ?? dashboard.security_details[0];
  }, [dashboard, selectedCusip]);
  const selectedBenchmarkAuditRows = useMemo(() => {
    const tenor = nearestTenorLabel(selectedSecurity?.maturity_bucket);
    if (!tenor || !dashboard?.benchmark_audit.length) {
      return [];
    }
    return dashboard.benchmark_audit.filter((row) => row.tenor === tenor).slice(0, 20);
  }, [dashboard, selectedSecurity]);
  const selectedSecurityStats = useMemo(() => {
    if (!selectedSecurity) {
      return null;
    }
    const trades = selectedSecurity.trades;
    const buys = trades.filter((trade) => String(trade.trade_type ?? "").toLowerCase().includes("buy"));
    const sells = trades.filter((trade) => String(trade.trade_type ?? "").toLowerCase().includes("sell"));
    const spreads = trades.map((trade) => trade.spread_bps).filter((value): value is number => value !== null);
    const latestSpread = spreads.at(-1) ?? null;
    const firstSpread = spreads[0] ?? null;
    const avg = (items: number[]) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
    const avgBuySpread = avg(buys.map((trade) => trade.spread_bps).filter((value): value is number => value !== null));
    const avgSellSpread = avg(sells.map((trade) => trade.spread_bps).filter((value): value is number => value !== null));
    return {
      spread_path_change: latestSpread !== null && firstSpread !== null ? latestSpread - firstSpread : null,
      buy_count: buys.length,
      sell_count: sells.length,
      other_count: trades.length - buys.length - sells.length,
      buy_par: buys.reduce((sum, trade) => sum + trade.trade_amount, 0),
      sell_par: sells.reduce((sum, trade) => sum + trade.trade_amount, 0),
      bid_ask_proxy_bps: avgBuySpread !== null && avgSellSpread !== null ? avgSellSpread - avgBuySpread : null,
      avg_trade_size: trades.length ? selectedSecurity.total_trade_amount / trades.length : null
    };
  }, [selectedSecurity]);
  const issuerCurveReadthrough = useMemo(() => {
    if (!dashboard || !payload) {
      return null;
    }
    const point =
      dashboard.issuer_curve.find((row) => row.maturity_bucket === (activeBucket ?? payload.maturity_bucket)) ??
      dashboard.issuer_curve.find((row) => row.maturity_bucket === payload.maturity_bucket) ??
      dashboard.issuer_curve[0];
    if (!point) {
      return null;
    }
    return {
      quote: `${payload.issuer ?? "Issuer"} ${point.maturity_bucket} screens at ${formatNumber(point.issuer_yield, "%")} versus ${formatNumber(point.benchmark_yield, "%")} active benchmark yield, or ${formatNumber(point.spread_bps, " bps")} spread.`,
      evidence: [
        `Active benchmark source: ${payload.universe.benchmark_source ?? "Unavailable"}.`,
        `Curve point uses ${point.trade_count.toLocaleString()} trade(s) and ${formatMillions(point.total_trade_amount)} total par.`,
        `Selected curve mode: ${curveMode}. Active bucket: ${point.maturity_bucket}.`
      ]
    };
  }, [activeBucket, curveMode, dashboard, payload]);
  const activityReadthrough = useMemo(() => {
    if (!payload || !dashboard?.monthly_activity.length) {
      return null;
    }
    const rows = dashboard.monthly_activity;
    const latest = rows[rows.length - 1];
    const peak = [...rows].sort((a, b) => b.total_trade_amount - a.total_trade_amount)[0];
    const averageVolume = rows.reduce((sum, row) => sum + row.total_trade_amount, 0) / rows.length;
    return {
      quote: `${payload.issuer ?? "Issuer"} latest-month secondary-market volume was ${formatMillions(latest.total_trade_amount)} across ${latest.trade_count.toLocaleString()} trade(s); peak volume was ${formatMillions(peak.total_trade_amount)} in ${peak.month}.`,
      evidence: [
        `${rows.length.toLocaleString()} monthly observation(s) in the activity chart.`,
        `Average monthly volume is ${formatMillions(averageVolume)}.`,
        `Latest month shown: ${latest.month}.`
      ]
    };
  }, [dashboard, payload]);
  const liquidityReadthrough = useMemo(() => {
    if (!payload || !dashboard) {
      return null;
    }
    const topLiquidity = [...dashboard.top_cusip_activity].sort((a, b) => (b.liquidity_score ?? -Infinity) - (a.liquidity_score ?? -Infinity))[0];
    const staleRows = dashboard.staleness_distribution.filter((row) => ["31-90D", "91-180D", "180D+"].includes(row.bucket));
    const staleShare = staleRows.reduce((sum, row) => sum + row.share_pct, 0);
    return {
      quote: topLiquidity
        ? `Liquidity screen highlights ${topLiquidity.cusip} with liquidity score ${formatNumber(topLiquidity.liquidity_score)}; ${staleShare.toFixed(1)}% of scored CUSIPs have not traded in more than 30 days.`
        : `Liquidity score for the selected issuer/bucket is ${formatNumber(payload.signals.liquidity.liquidity_score)} with ${payload.signals.liquidity.trade_count.toLocaleString()} recent trade(s).`,
      evidence: [
        `Recent selected-bucket liquidity score: ${formatNumber(payload.signals.liquidity.liquidity_score)}.`,
        `Selected-bucket recent trade amount: ${payload.signals.liquidity.total_trade_amount.toLocaleString()}.`,
        `${dashboard.top_cusip_activity.length.toLocaleString()} top CUSIP activity rows are available.`
      ]
    };
  }, [dashboard, payload]);
  const screenerReadthrough = useMemo(() => {
    if (!topOpportunity) {
      return null;
    }
    return {
      quote: `${topOpportunity.cusip} leads the current screener as ${topOpportunity.signal}; spread is ${formatNumber(topOpportunity.spread_to_benchmark_bps, " bps")}, liquidity is ${formatNumber(topOpportunity.liquidity_score)}, and RV score is ${formatNumber(topOpportunity.rv_score)}.`,
      evidence: [
        `Decision label: ${decisionLabel(topOpportunity)}.`,
        `Total par traded: ${topOpportunity.total_trade_amount.toLocaleString()}.`,
        `Latest trade date: ${topOpportunity.latest_trade_date ?? "N/A"}.`
      ],
      polish: topOpportunity.evidence
    };
  }, [topOpportunity]);
  const selectedCusipReadthrough = useMemo(() => {
    if (!selectedSecurity) {
      return null;
    }
    const datedTrades = selectedSecurity.trades.filter((trade) => trade.date);
    const firstTrade = datedTrades[0];
    const lastTrade = datedTrades[datedTrades.length - 1];
    const yieldMove =
      firstTrade?.yield !== null && firstTrade?.yield !== undefined && lastTrade?.yield !== null && lastTrade?.yield !== undefined
        ? (lastTrade.yield - firstTrade.yield) * 100
        : null;
    return {
      quote: `${selectedSecurity.cusip} traded from ${firstTrade?.date ?? "N/A"} to ${lastTrade?.date ?? "N/A"}; yield moved ${formatNumber(yieldMove, " bps")} and latest spread is ${formatNumber(selectedSecurity.spread_to_benchmark_bps, " bps")}.`,
      evidence: [
        `Trade count: ${selectedSecurity.trade_count.toLocaleString()}. Total par: ${selectedSecurity.total_trade_amount.toLocaleString()}.`,
        `Signal: ${selectedSecurity.signal}. Liquidity score: ${formatNumber(selectedSecurity.liquidity_score)}.`,
        `Benchmark audit tenor: ${nearestTenorLabel(selectedSecurity.maturity_bucket) ?? "N/A"}.`
      ],
      polish: selectedSecurity.readthrough
    };
  }, [selectedSecurity]);
  const sameBucketComparables = useMemo(() => {
    if (!selectedSecurity?.maturity_bucket) {
      return [];
    }
    return candidates
      .filter((candidate) => candidate.maturity_bucket === selectedSecurity.maturity_bucket && candidate.cusip !== selectedSecurity.cusip)
      .slice(0, 8);
  }, [candidates, selectedSecurity]);
  const allUploadedFiles = useMemo(
    () => [
      ...tradeFiles,
      ...(bondReference ? [bondReference] : []),
      ...(issuerMapping ? [issuerMapping] : []),
      ...(mmdBenchmark ? [mmdBenchmark] : [])
    ],
    [bondReference, issuerMapping, mmdBenchmark, tradeFiles]
  );
  const uploadBytes = useMemo(() => allUploadedFiles.reduce((sum, file) => sum + file.size, 0), [allUploadedFiles]);
  const uploadWarnings = useMemo(() => {
    const warnings: string[] = [];
    const oversized = allUploadedFiles.filter((file) => file.size > maxUiFileBytes);
    if (oversized.length) {
      warnings.push(`${oversized.map((file) => file.name).join(", ")} exceeds the 25MB per-file limit.`);
    }
    if (uploadBytes > maxUiBundleBytes) {
      warnings.push("Selected files exceed the 80MB combined upload limit.");
    }
    if (tradeFiles.length > 12) {
      warnings.push("Select 12 or fewer trade files at a time.");
    }
    return warnings;
  }, [allUploadedFiles, tradeFiles.length, uploadBytes]);
  const validationChecklistRows = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    const benchmarkMatch = dashboard.data_audit_center.reconciliation.benchmark_match_rate_pct;
    return [
      {
        check: "Multi-file upload",
        status: tradeFiles.length >= 2 ? "Ready" : tradeFiles.length === 1 ? "Single file" : "Waiting",
        detail: `${tradeFiles.length.toLocaleString()} trade file(s) selected; UI accepts two or more files.`
      },
      {
        check: "AAA MMD benchmark",
        status: dashboard.benchmark_governance.uploaded_mmd_points ? "Ready" : "Needs upload",
        detail: dashboard.benchmark_governance.uploaded_mmd_points
          ? `${dashboard.benchmark_governance.uploaded_mmd_points.toLocaleString()} uploaded AAA MMD point(s) available.`
          : "Upload the AAA MMD file when validating production outputs."
      },
      {
        check: "Benchmark match",
        status: benchmarkMatch >= 80 ? "Pass" : benchmarkMatch >= 40 ? "Review" : "Blocked",
        detail: `${benchmarkMatch.toFixed(1)}% active benchmark match rate.`
      },
      {
        check: "Expected output sample",
        status: "Needed",
        detail: "Still need one validated issuer file with expected spreads, liquidity, top CUSIPs, and report outputs."
      },
      {
        check: "Vercel upload limits",
        status: uploadWarnings.length ? "Review" : "Pass",
        detail: uploadWarnings.length ? uploadWarnings.join(" ") : `${(uploadBytes / 1024 / 1024).toFixed(1)}MB selected versus 80MB UI bundle limit.`
      },
      {
        check: "Report exports",
        status: "Ready",
        detail: "JSON, HTML, CSV, Markdown, direct PDF, and PPTX deck exports are wired in the client."
      }
    ];
  }, [dashboard, tradeFiles.length, uploadBytes, uploadWarnings]);
  const canGenerate = tradeFiles.length > 0 && uploadWarnings.length === 0 && !isLoading;
  const previewRowLimit = performanceMode === "lean" ? 12 : 40;
  const chartRowLimit = performanceMode === "lean" ? 10 : 18;
  const workflowSteps = [
    {
      href: "#data-intake",
      index: "01",
      title: "Upload",
      detail: tradeFiles.length ? `${tradeFiles.length} trade file(s)` : "Upload files",
      status: tradeFiles.length ? "ready" : "active"
    },
    {
      href: "#audit-center",
      index: "02",
      title: "Data Audit",
      detail: dashboard ? `${dashboard.data_audit_center.reconciliation.benchmark_match_rate_pct}% benchmark match` : "Waiting",
      status: dashboard ? dashboard.data_audit_center.overall_status : "pending"
    },
    {
      href: "#desk-output",
      index: "03",
      title: "Snapshot",
      detail: dashboard ? dashboard.desk_snapshot.confidence : "Waiting",
      status: dashboard ? "ready" : "pending"
    },
    {
      href: "#visual-analytics",
      index: "04",
      title: "Core Charts",
      detail: dashboard ? `${dashboard.issuer_curve.length} curve point(s)` : "Run dashboard",
      status: dashboard ? "ready" : "pending"
    },
    {
      href: "#cusip-drilldown",
      index: "05",
      title: "CUSIP Drilldown",
      detail: selectedCusip || "Select CUSIP",
      status: selectedCusip ? "ready" : "pending"
    },
    {
      href: "#advanced-rv",
      index: "06",
      title: "Advanced RV",
      detail: dashboard ? `${dashboard.peer_rv.length + dashboard.cross_issuer_rv.length} RV row(s)` : "Waiting",
      status: dashboard ? "ready" : "pending"
    },
    {
      href: "#narrative-export",
      index: "07",
      title: "Export",
      detail: dashboard ? "PDF / PPTX ready" : "Waiting",
      status: dashboard ? "ready" : "pending"
    },
    {
      href: "#streamlit-parity",
      index: "08",
      title: "Validation",
      detail: dashboard ? `${parityStats.partial} partial gap(s)` : "Waiting",
      status: dashboard ? (validationChecklistRows.some((row) => row.status === "Blocked") ? "blocked" : "ready") : "pending"
    }
  ];
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
    const headers = ["cusip", "issuer", "signal", "maturity_bucket", "spread_to_benchmark_bps", "liquidity_score", "rv_score", "trade_count", "total_trade_amount", "latest_trade_date", "note"];
    const rows = watchlistRows.map((row) =>
      [
        row.cusip,
        row.issuer,
        row.signal,
        row.maturity_bucket ?? "",
        row.spread_to_benchmark_bps ?? "",
        row.liquidity_score ?? "",
        row.rv_score ?? "",
        row.trade_count,
        row.total_trade_amount,
        row.latest_trade_date ?? "",
        watchlistNotes[row.cusip] ?? ""
      ]
        .map((value) => JSON.stringify(value))
        .join(",")
    );
    return `data:text/csv;charset=utf-8,${encodeURIComponent([headers.join(","), ...rows].join("\n"))}`;
  }, [watchlistRows, watchlistNotes]);

  function selectCusip(cusip: string) {
    setSelectedCusip(cusip);
    const security = dashboard?.security_details.find((item) => item.cusip === cusip);
    const candidate = candidates.find((item) => item.cusip === cusip);
    const bucket = security?.maturity_bucket ?? candidate?.maturity_bucket ?? null;
    if (bucket) {
      setActiveBucket(bucket);
    }
  }

  function toggleWatchlist(cusip: string) {
    setWatchlist((current) => (current.includes(cusip) ? current.filter((item) => item !== cusip) : [...current, cusip].sort()));
  }

  function updateWatchlistNote(cusip: string, note: string) {
    setWatchlistNotes((current) => ({ ...current, [cusip]: note }));
  }

  function downloadPdfReport() {
    if (!payload || !dashboard) {
      setError("Generate a dashboard before downloading the PDF report.");
      return;
    }
    downloadBlob(buildPdfReportBlob(payload, dashboard, candidates), "secondary_market_report.pdf");
  }

  function downloadPptxReport() {
    if (!payload || !dashboard) {
      setError("Generate a dashboard before downloading the PPTX deck.");
      return;
    }
    downloadBlob(buildPptxReportBlob(payload, dashboard, candidates), "secondary_market_deck.pptx");
  }

  function openPrintReport() {
    const html = dashboard?.report_artifacts.html_report;
    if (!html) {
      setError("Generate a report before opening the PDF print view.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("The browser blocked the print report window. Allow popups for localhost and try again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  }

  function resetWorkspace() {
    setTradeFiles([]);
    setBondReference(null);
    setIssuerMapping(null);
    setMmdBenchmark(null);
    setIssuer("");
    setSectorOverride("");
    setMaturityBucket("");
    setPeriodDays(30);
    setMinSpread(15);
    setMinLiquidity(40);
    setMinTrades(2);
    setPayload(null);
    setValidation(null);
    setCandidates([]);
    setDashboard(null);
    setSelectedCusip("");
    setActiveBucket(null);
    setCurveMode("yield");
    setShowIssuerCurve(true);
    setShowBenchmarkCurve(true);
    setShowReferenceLines(true);
    setRatingCurveView("AAA");
    setPositioningYAxis("spread");
    setTrendRange("90");
    setScenarioShockBps(25);
    setCandidateSort("rv_score");
    setCandidateLimit(25);
    setCandidateView("all");
    setTableDensity("compact");
    setPerformanceMode("standard");
    setShowDeveloperPayload(false);
    setSecuritySearch("");
    setError("");
    setIsLoading(false);
    setFileInputVersion((version) => version + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tradeFiles.length) {
      setError("Select at least one CSV or Excel trade file.");
      return;
    }
    if (uploadWarnings.length) {
      setError(uploadWarnings.join(" "));
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
    formData.set("sectorOverride", sectorOverride);
    formData.set("maturityBucket", maturityBucket);
    formData.set("periodDays", String(periodDays));

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch("/api/nextsr-payload", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const fallbackMessage =
          response.status === 504
            ? "Dashboard generation timed out before the server returned a response. Large XLSX files can take longer to parse; this version now sends a lighter initial dashboard, so retry once after refreshing."
            : `Payload generation failed with HTTP ${response.status}.`;
        throw new Error(data?.error ?? fallbackMessage);
      }
      if (!data) {
        throw new Error("Payload generation returned an empty response.");
      }
      setPayload(data.payload);
      setValidation(data.validation);
      setCandidates(data.security_screener ?? []);
      setDashboard(data.dashboard ?? null);
      setSelectedCusip(data.dashboard?.security_details?.[0]?.cusip ?? data.security_screener?.[0]?.cusip ?? "");
      setActiveBucket(data.payload?.maturity_bucket ?? data.dashboard?.security_details?.[0]?.maturity_bucket ?? null);
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "AbortError" ? "Payload generation timed out after 90 seconds. Try a smaller upload bundle or fewer trade files." : caught instanceof Error ? caught.message : "Payload generation failed.");
    } finally {
      window.clearTimeout(timeout);
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

      <nav className="workflow-rail" aria-label="Dashboard workflow">
        {workflowSteps.map((step) => (
          <a className={`workflow-step ${step.status}`} href={step.href} key={step.href}>
            <span>{step.index}</span>
            <strong>{step.title}</strong>
            <em>{step.detail}</em>
          </a>
        ))}
      </nav>

      <div className="workspace" id="data-intake">
        <section className="panel">
          <h2>Input</h2>
          <form className="form-stack" onSubmit={submit}>
            <div className="field">
              <label htmlFor="trade-file">Trade Files</label>
              <input
                id="trade-file"
                accept=".csv,.xlsx,.xls,text/csv"
                key={`trade-${fileInputVersion}`}
                multiple
                type="file"
                onChange={(event) => setTradeFiles(Array.from(event.target.files ?? []))}
              />
              <span className="field-help">{tradeFiles.length ? `${tradeFiles.length} file(s) selected` : "Upload one or more MuniPro trade-history exports."}</span>
              {allUploadedFiles.length ? (
                <span className="field-help">
                  Upload bundle: {(uploadBytes / 1024 / 1024).toFixed(1)}MB across {allUploadedFiles.length} file(s).
                </span>
              ) : null}
              {tradeFiles.length ? (
                <div className="selected-file-list">
                  {tradeFiles.map((file) => (
                    <div className="selected-file-pill" key={`${file.name}-${file.size}-${file.lastModified}`}>
                      <span>{file.name}</span>
                      <strong>{(file.size / 1024 / 1024).toFixed(1)}MB</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <details className="input-expander">
              <summary>Optional Reference Files</summary>
              <div className="form-stack compact-stack">
                <div className="field">
                  <label htmlFor="bond-reference">Bond Reference</label>
                  <input id="bond-reference" accept=".csv,.xlsx,.xls,text/csv" key={`bond-${fileInputVersion}`} type="file" onChange={(event) => setBondReference(event.target.files?.[0] ?? null)} />
                </div>
                <div className="field">
                  <label htmlFor="issuer-mapping">Issuer / Sector Mapping</label>
                  <input id="issuer-mapping" accept=".csv,.xlsx,.xls,text/csv" key={`issuer-map-${fileInputVersion}`} type="file" onChange={(event) => setIssuerMapping(event.target.files?.[0] ?? null)} />
                </div>
                <div className="field">
                  <label htmlFor="mmd-benchmark">AAA MMD / Benchmark Curve</label>
                  <input id="mmd-benchmark" accept=".csv,.xlsx,.xls,text/csv" key={`mmd-${fileInputVersion}`} type="file" onChange={(event) => setMmdBenchmark(event.target.files?.[0] ?? null)} />
                </div>
                <div className="template-grid">
                  {templateDownloads.map((template) => (
                    <a className="template-link" download={template.file} href={template.href} key={template.file}>
                      {template.label}
                    </a>
                  ))}
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
              <label htmlFor="sector-override">Sector Override</label>
              <input
                id="sector-override"
                value={sectorOverride}
                onChange={(event) => setSectorOverride(event.target.value)}
                placeholder="Optional; applies when issuer override is set"
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

            <details className="input-expander">
              <summary>Performance / Workspace</summary>
              <div className="form-stack compact-stack">
                <div className="field">
                  <label htmlFor="performance-mode">Display Mode</label>
                  <select id="performance-mode" value={performanceMode} onChange={(event) => setPerformanceMode(event.target.value)}>
                    <option value="standard">Standard</option>
                    <option value="lean">Lean</option>
                  </select>
                  <span className="field-help">Lean mode keeps the same analytics but shows shorter preview tables in the browser.</span>
                </div>
                <label className="toggle-row" htmlFor="developer-payload-toggle">
                  <input
                    checked={showDeveloperPayload}
                    id="developer-payload-toggle"
                    type="checkbox"
                    onChange={(event) => setShowDeveloperPayload(event.target.checked)}
                  />
                  Show developer diagnostics by default
                </label>
                <button className="secondary-button full-width" type="button" onClick={resetWorkspace}>
                  Reset Workspace
                </button>
              </div>
            </details>

            {uploadWarnings.length ? (
              <div className="validation-warning">{uploadWarnings.join(" ")}</div>
            ) : null}

            <div className="readiness-strip">
              <span className={tradeFiles.length ? "ready" : ""}>Trade file</span>
              <span className={!uploadWarnings.length ? "ready" : ""}>Upload limits</span>
              <span className="ready">Vercel API</span>
            </div>

            <button className="primary-button" type="submit" disabled={!canGenerate}>
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

        <section className="panel output-panel" id="desk-output">
          <div className="toolbar">
            <h2>Output</h2>
            {payload ? (
              <div className="button-row compact-actions">
                <a className="secondary-button" href="#visual-analytics">
                  View Charts
                </a>
                <a className="secondary-button" href="#narrative-export">
                  Export Center
                </a>
                <a className="secondary-button" href={downloadHref} download="nextsr_payload.json">
                  Payload JSON
                </a>
              </div>
            ) : null}
          </div>

          {error ? <div className="error-state">{error}</div> : null}

          {!error && !payload ? <div className="empty-state">No payload generated.</div> : null}

          {payload ? (
            <div className="content-grid">
              {dashboard?.desk_snapshot ? (
                <section className="desk-snapshot">
                  <div className="snapshot-main">
                    <div>
                      <span className="eyebrow">Desk Snapshot</span>
                      <h2>{dashboard.desk_snapshot.thesis}</h2>
                      <p>{dashboard.desk_snapshot.market_read}</p>
                      <p>{dashboard.desk_snapshot.action_bias}</p>
                    </div>
                    <div className={`confidence-card ${dashboard.desk_snapshot.confidence.toLowerCase()}`}>
                      <span>Confidence</span>
                      <strong>{dashboard.desk_snapshot.confidence}</strong>
                    </div>
                  </div>
                  <div className="snapshot-metrics">
                    {dashboard.desk_snapshot.key_metrics.map((metric) => (
                      <div className={`snapshot-metric ${metric.tone}`} key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <em>{metric.detail}</em>
                      </div>
                    ))}
                  </div>
                  <div className="snapshot-columns">
                    <div>
                      <strong>Decision Points</strong>
                      {dashboard.desk_snapshot.decision_points.map((item) => <p key={item}>{item}</p>)}
                    </div>
                    <div>
                      <strong>Next Steps</strong>
                      {dashboard.desk_snapshot.next_steps.map((item) => <p key={item}>{item}</p>)}
                    </div>
                    <div>
                      <strong>Risk Flags</strong>
                      {dashboard.desk_snapshot.risk_flags.map((item) => <p key={item}>{item}</p>)}
                    </div>
                  </div>
                </section>
              ) : null}
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
              <details className="developer-payload" onToggle={(event) => setShowDeveloperPayload(event.currentTarget.open)} open={showDeveloperPayload}>
                <summary>Developer Payload</summary>
                <pre className="json-block">{jsonText}</pre>
              </details>
            </div>
          ) : null}
        </section>
      </div>

      {payload && dashboard ? (
        <section className="parity-band" id="audit-center">
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

          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>Data Audit Center</h2>
                <p>Row reconciliation, required-field coverage, and benchmark matching checks.</p>
              </div>
              <span className={`audit-status ${dashboard.data_audit_center.overall_status}`}>{dashboard.data_audit_center.overall_status}</span>
            </div>
            <div className="metrics dense">
              <div className="metric"><span>Raw Rows</span><strong>{dashboard.data_audit_center.reconciliation.raw_rows.toLocaleString()}</strong></div>
              <div className="metric"><span>Model Ready</span><strong>{dashboard.data_audit_center.reconciliation.model_ready_rows.toLocaleString()}</strong></div>
              <div className="metric"><span>Benchmark Match</span><strong>{formatPct(dashboard.data_audit_center.reconciliation.benchmark_match_rate_pct)}</strong></div>
              <div className="metric"><span>Reference Match</span><strong>{formatPct(dashboard.data_audit_center.reconciliation.cusip_reference_match_rate_pct)}</strong></div>
            </div>
            <div className="quality-scorecard">
              <div className={`quality-overall ${dashboard.data_quality_scorecard.status}`}>
                <span>Quality Score</span>
                <strong>{formatNumber(dashboard.data_quality_scorecard.overall_score)}</strong>
                <em>{dashboard.data_quality_scorecard.status}</em>
              </div>
              {dashboard.data_quality_scorecard.metrics.map((metric) => (
                <div className={`quality-metric ${metric.status}`} key={metric.metric} title={metric.detail}>
                  <span>{metric.metric}</span>
                  <strong>{formatPct(metric.score)}</strong>
                  <em>{metric.detail}</em>
                </div>
              ))}
            </div>
            {dashboard.data_audit_center.warnings.length ? (
              <div className="warning-list">
                {dashboard.data_audit_center.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}
            <MiniTable
              rows={dashboard.data_audit_center.steps}
              columns={[
                { key: "step", header: "Step", render: (row) => row.step },
                { key: "status", header: "Status", render: (row) => row.status },
                { key: "in", header: "Rows In", render: (row) => row.rows_in.toLocaleString() },
                { key: "out", header: "Rows Out", render: (row) => row.rows_out.toLocaleString() },
                { key: "reject", header: "Rejected", render: (row) => row.rejected_rows.toLocaleString() },
                { key: "notes", header: "Notes", render: (row) => row.notes.join(" ") }
              ]}
            />
            <details className="developer-payload">
              <summary>Field Coverage</summary>
              <MiniTable
                rows={dashboard.data_audit_center.field_coverage}
                columns={[
                  { key: "field", header: "Field", render: (row) => row.field },
                  { key: "column", header: "Detected Column", render: (row) => row.detected_column },
                  { key: "nonnull", header: "Non-null Rows", render: (row) => row.non_null_rows.toLocaleString() },
                  { key: "coverage", header: "Coverage", render: (row) => `${row.coverage_pct}%` },
                  { key: "required", header: "Required", render: (row) => row.required ? "Yes" : "No" }
                ]}
              />
            </details>
          </article>
        </section>
      ) : null}

      {payload && dashboard ? (
        <section className="visual-grid" id="visual-analytics">
          <article className="panel chart-panel wide">
            <div className="chart-header">
              <div>
                <h2>{payload.issuer} Issuer Curve vs Benchmark</h2>
                <p>{curveMode === "yield" ? "Average issuer yield by maturity bucket over the selected lookback window." : "Spread to benchmark by maturity bucket over the selected lookback window."}</p>
              </div>
              <div className="chart-control-stack">
                <div className="segmented-control">
                  <button className={curveMode === "yield" ? "active" : ""} type="button" onClick={() => setCurveMode("yield")}>
                    Yield
                  </button>
                  <button className={curveMode === "spread" ? "active" : ""} type="button" onClick={() => setCurveMode("spread")}>
                    Spread
                  </button>
                </div>
                {curveMode === "yield" ? (
                  <div className="legend">
                    <button className={showIssuerCurve ? "legend-button active" : "legend-button"} type="button" onClick={() => setShowIssuerCurve((value) => !value)}>
                      <i className="legend-dot issuer-key" />Issuer
                    </button>
                    <button className={showBenchmarkCurve ? "legend-button active" : "legend-button"} type="button" onClick={() => setShowBenchmarkCurve((value) => !value)}>
                      <i className="legend-dot benchmark-key" />Benchmark
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <IssuerCurveChart
              activeBucket={activeBucket}
              data={dashboard.issuer_curve}
              mode={curveMode}
              onSelectBucket={setActiveBucket}
              showIssuer={showIssuerCurve}
              showBenchmark={showBenchmarkCurve}
            />
            {issuerCurveReadthrough ? (
              <AnalystReadthrough
                title="Analyst read-through - issuer curve"
                quote={issuerCurveReadthrough.quote}
                evidence={issuerCurveReadthrough.evidence}
              />
            ) : null}
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Spread Trend</h2>
                <p>{activeBucket ?? payload.maturity_bucket ?? "Selected bucket"} spread to benchmark · {visibleSpreadTrend.length.toLocaleString()} point(s).</p>
              </div>
              <div className="chart-control-stack">
                <div className="segmented-control">
                  {[
                    ["30", "30D"],
                    ["90", "90D"],
                    ["180", "180D"],
                    ["365", "1Y"],
                    ["all", "All"]
                  ].map(([value, label]) => (
                    <button className={trendRange === value ? "active" : ""} key={value} type="button" onClick={() => setTrendRange(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="segmented-control">
                  <button className={showReferenceLines ? "active" : ""} type="button" onClick={() => setShowReferenceLines(true)}>
                    Refs On
                  </button>
                  <button className={!showReferenceLines ? "active" : ""} type="button" onClick={() => setShowReferenceLines(false)}>
                    Refs Off
                  </button>
                </div>
              </div>
            </div>
            <SpreadTrendChart data={visibleSpreadTrend} referenceLines={showReferenceLines ? dashboard.chart_reference_lines : []} />
            {showReferenceLines && dashboard.chart_reference_lines.length ? (
              <div className="reference-line-list">
                {dashboard.chart_reference_lines.map((line) => (
                  <div className={`reference-chip ${line.tone}`} key={line.id} title={line.description}>
                    <span>{line.label}</span>
                    <strong>{line.value_bps.toFixed(1)} bps</strong>
                    <em>{line.source}</em>
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Monthly Activity</h2>
                <p>Trade-count history for the uploaded issuer file.</p>
              </div>
            </div>
            <ActivityChart data={dashboard.monthly_activity} />
            {activityReadthrough ? (
              <AnalystReadthrough
                title="Analyst read-through - trading volume"
                quote={activityReadthrough.quote}
                evidence={activityReadthrough.evidence}
              />
            ) : null}
          </article>

          <article className="panel chart-panel wide">
            <div className="chart-header">
              <div>
                <h2>RV Positioning Map</h2>
                <p>Liquidity score versus {positioningYAxis === "yield" ? "average yield" : "spread"}, sized by total par traded.</p>
              </div>
              <div className="segmented-control">
                <button className={positioningYAxis === "spread" ? "active" : ""} type="button" onClick={() => setPositioningYAxis("spread")}>
                  Spread
                </button>
                <button className={positioningYAxis === "yield" ? "active" : ""} type="button" onClick={() => setPositioningYAxis("yield")}>
                  Yield
                </button>
              </div>
            </div>
            <PositioningChart data={dashboard.positioning} selectedCusip={selectedCusip} yAxis={positioningYAxis} onSelect={selectCusip} />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Opportunity Map</h2>
                <p>Candidate counts by rich/cheap and liquidity posture.</p>
              </div>
            </div>
            <div className="quadrant-grid">
              {opportunityQuadrants.map((quadrant) => (
                <div className="quadrant-card" key={quadrant.label}>
                  <span>{quadrant.label}</span>
                  <strong>{quadrant.count.toLocaleString()}</strong>
                  <em>{quadrant.totalPar.toLocaleString()} total par</em>
                  <button className="link-button" type="button" onClick={() => quadrant.topCusip !== "N/A" && selectCusip(quadrant.topCusip)}>
                    {quadrant.topCusip}
                  </button>
                </div>
              ))}
            </div>
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Spread Movement Ladder</h2>
                <p>Latest spread movement by maturity bucket.</p>
              </div>
            </div>
            <MiniTable<SpreadMovementPoint>
              rows={dashboard.spread_movement_ladder.slice(0, chartRowLimit)}
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
                <h2>Current Spread Heatmap</h2>
                <p>Latest spread level by maturity bucket with movement context.</p>
              </div>
            </div>
            <div className="heatmap-grid">
              {dashboard.spread_movement_ladder.slice(0, 24).map((row) => (
                <button
                  className={`heatmap-cell ${heatmapTone(row.latest_spread_bps)} ${row.maturity_bucket === activeBucket ? "selected" : ""}`}
                  key={row.maturity_bucket}
                  type="button"
                  onClick={() => setActiveBucket(row.maturity_bucket)}
                >
                  <span>{row.maturity_bucket}</span>
                  <strong>{formatNumber(row.latest_spread_bps, " bps")}</strong>
                  <em>1M {formatNumber(row.move_1m_bps, " bps")}</em>
                </button>
              ))}
            </div>
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Liquidity / Trading Frequency</h2>
                <p>Bucket-level trade frequency and liquidity score.</p>
              </div>
            </div>
            <BarMetricChart<LiquidityPoint> activeLabel={activeBucket} data={dashboard.liquidity} label={(row) => row.maturity_bucket} onSelect={setActiveBucket} value={(row) => row.liquidity_score} tone="teal" />
            {liquidityReadthrough ? (
              <AnalystReadthrough
                title="Analyst read-through - liquidity"
                quote={liquidityReadthrough.quote}
                evidence={liquidityReadthrough.evidence}
              />
            ) : null}
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Trade Size Distribution</h2>
                <p>Recent issuer trades grouped by par amount.</p>
              </div>
            </div>
            <BarMetricChart<DistributionPoint> data={dashboard.trade_size_distribution} label={(row) => row.bucket} value={(row) => row.trade_count} tone="blue" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Staleness Histogram</h2>
                <p>CUSIPs grouped by days since last trade.</p>
              </div>
            </div>
            <BarMetricChart<DistributionPoint> data={dashboard.staleness_distribution} label={(row) => row.bucket} value={(row) => row.cusip_count} tone="rose" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Top CUSIP Activity</h2>
                <p>Most frequently traded CUSIPs in the selected issuer universe.</p>
              </div>
            </div>
            <MiniTable<TopCusipActivityPoint>
              rows={dashboard.top_cusip_activity.slice(0, chartRowLimit)}
              columns={[
                { key: "cusip", header: "CUSIP", render: (row) => row.cusip },
                { key: "bucket", header: "Bucket", render: (row) => row.maturity_bucket },
                { key: "trades", header: "Trades", render: (row) => row.trade_count.toLocaleString() },
                { key: "par", header: "Total Par", render: (row) => row.total_trade_amount.toLocaleString() },
                { key: "stale", header: "Last Trade", render: (row) => row.days_since_last_trade === null ? "N/A" : `${row.days_since_last_trade}D` }
              ]}
            />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Peer Relative Value</h2>
                <p>Selected issuer spread versus peer median by bucket.</p>
              </div>
            </div>
            <BarMetricChart<PeerRvPoint> activeLabel={activeBucket} data={dashboard.peer_rv} label={(row) => row.maturity_bucket} onSelect={setActiveBucket} value={(row) => row.peer_gap_bps} tone="rose" />
            <MiniTable<PeerRvPoint>
              rows={[...dashboard.peer_rv].sort((a, b) => Math.abs(b.peer_gap_bps ?? 0) - Math.abs(a.peer_gap_bps ?? 0)).slice(0, 8)}
              columns={[
                { key: "bucket", header: "Bucket", render: (row) => row.maturity_bucket },
                { key: "issuer", header: "Issuer Spread", render: (row) => formatNumber(row.issuer_spread_bps, " bps") },
                { key: "peer", header: "Peer Median", render: (row) => formatNumber(row.peer_median_spread_bps, " bps") },
                { key: "gap", header: "Gap", render: (row) => formatNumber(row.peer_gap_bps, " bps") },
                { key: "n", header: "Peers", render: (row) => row.peer_issuer_count.toLocaleString() }
              ]}
            />
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
                { key: "trades", header: "Trades", render: (row) => row.trade_count.toLocaleString() },
                { key: "action", header: "Action", render: (row) => decisionLabel(row) }
              ]}
            />
          </article>

          <article className="panel chart-panel wide" id="advanced-rv">
            <div className="chart-header">
              <div>
                <h2>Advanced RV Decision Matrix</h2>
                <p>Peer gap and cross-issuer rank translated into decision-ready review tables.</p>
              </div>
            </div>
            <div className="split-list">
              <div>
                <h3>Peer Gap Ladder</h3>
                <MiniTable
                  rows={rvDecisionRows}
                  columns={[
                    { key: "bucket", header: "Bucket", render: (row) => row.maturity_bucket },
                    { key: "issuer", header: "Issuer Spread", render: (row) => formatNumber(row.issuer_spread_bps, " bps") },
                    { key: "peer", header: "Peer Median", render: (row) => formatNumber(row.peer_median_spread_bps, " bps") },
                    { key: "gap", header: "Gap", render: (row) => formatNumber(row.peer_gap_bps, " bps") },
                    { key: "decision", header: "Decision", render: (row) => row.decision },
                    { key: "evidence", header: "Evidence", render: (row) => row.evidence }
                  ]}
                />
              </div>
              <div>
                <h3>Issuer Opportunity Ranking</h3>
                <MiniTable
                  rows={crossIssuerMatrixRows}
                  columns={[
                    { key: "issuer", header: "Issuer", render: (row) => row.issuer },
                    { key: "sector", header: "Sector", render: (row) => row.sector ?? "N/A" },
                    { key: "spread", header: "Avg Spread", render: (row) => formatNumber(row.avg_spread_bps, " bps") },
                    { key: "liquidity", header: "Liquidity", render: (row) => formatNumber(row.liquidity_score) },
                    { key: "rv", header: "RV", render: (row) => formatNumber(row.rv_score) },
                    { key: "decision", header: "Decision", render: (row) => row.decision }
                  ]}
                />
              </div>
            </div>
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Spread Attribution Waterfall</h2>
                <p>Benchmark yield plus issuer spread bridge.</p>
              </div>
            </div>
            <BarMetricChart<SpreadAttributionPoint> data={dashboard.spread_attribution} label={(row) => row.component} value={(row) => row.value_bps} tone="blue" />
            <MiniTable<SpreadAttributionPoint>
              rows={dashboard.spread_attribution}
              columns={[
                { key: "component", header: "Component", render: (row) => row.component },
                { key: "value", header: "Value", render: (row) => formatNumber(row.value_bps, " bps") },
                { key: "detail", header: "Methodology", render: (row) => row.detail }
              ]}
            />
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
            <BarMetricChart<HistoricalSpreadPoint> activeLabel={activeBucket} data={dashboard.historical_percentiles} label={(row) => row.maturity_bucket} onSelect={setActiveBucket} value={(row) => row.percentile} tone="blue" />
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
            <BarMetricChart<CurveShapeMetric> data={dashboard.curve_shape} label={(row) => row.metric} value={(row) => row.value} tone="teal" />
          </article>

          <article className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>Scenario Shock Analysis</h2>
                <p>Approximate price impact by maturity bucket for a {scenarioShockBps >= 0 ? "+" : ""}{scenarioShockBps} bp shock.</p>
              </div>
              <div className="shock-control">
                <label htmlFor="scenario-shock">Shock</label>
                <input
                  id="scenario-shock"
                  max="150"
                  min="-150"
                  step="5"
                  type="number"
                  value={scenarioShockBps}
                  onChange={(event) => setScenarioShockBps(Number(event.target.value))}
                />
              </div>
            </div>
            <BarMetricChart<ScenarioShockPoint> data={visibleScenarioShock} label={(row) => row.maturity_bucket} value={(row) => row.approx_price_impact_pct} tone="rose" />
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
        <section className="panel screener-panel" id="security-workbench">
          <div className="toolbar">
            <h2>Security Screener</h2>
            <span className="table-count">{filteredCandidates.length.toLocaleString()} shown / {candidates.length.toLocaleString()} scored</span>
          </div>
          <div className="table-controls">
            <div className="field">
              <label htmlFor="security-search">Search</label>
              <input id="security-search" value={securitySearch} onChange={(event) => setSecuritySearch(event.target.value)} placeholder="CUSIP, issuer, signal" />
            </div>
            <div className="field">
              <label htmlFor="candidate-sort">Sort</label>
              <select id="candidate-sort" value={candidateSort} onChange={(event) => setCandidateSort(event.target.value)}>
                <option value="rv_score">RV Score</option>
                <option value="spread">Spread</option>
                <option value="liquidity">Liquidity</option>
                <option value="trades">Trades</option>
                <option value="par">Total Par</option>
                <option value="latest">Latest Trade</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="candidate-limit">Rows</label>
              <select id="candidate-limit" value={candidateLimit} onChange={(event) => setCandidateLimit(Number(event.target.value))}>
                {[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="candidate-view">View</label>
              <select id="candidate-view" value={candidateView} onChange={(event) => setCandidateView(event.target.value)}>
                <option value="all">All</option>
                <option value="watchlist">Watchlist</option>
                <option value="selected">Selected CUSIP</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="table-density">Density</label>
              <select id="table-density" value={tableDensity} onChange={(event) => setTableDensity(event.target.value)}>
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </div>
          </div>
          {topOpportunity ? (
            <div className="opportunity-readthrough">
              <div>
                <span className="eyebrow">Top Opportunity</span>
                <strong>{topOpportunity.cusip} · {topOpportunity.signal}</strong>
                <p>
                  {decisionLabel(topOpportunity)} based on spread {formatNumber(topOpportunity.spread_to_benchmark_bps, " bps")}, liquidity {formatNumber(topOpportunity.liquidity_score)}, RV score {formatNumber(topOpportunity.rv_score)}, and {topOpportunity.trade_count.toLocaleString()} trade(s).
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={() => selectCusip(topOpportunity.cusip)}>
                Open Drilldown
              </button>
            </div>
          ) : null}
          {screenerReadthrough ? (
            <AnalystReadthrough
              title="Analyst read-through - screener"
              quote={screenerReadthrough.quote}
              evidence={screenerReadthrough.evidence}
              polish={screenerReadthrough.polish}
            />
          ) : null}
          {filteredCandidates.length ? (
            <div className={`table-wrap ${tableDensity}`}>
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
                        <button className="link-button" type="button" onClick={() => selectCusip(candidate.cusip)}>
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
        <section className="parity-band final-band drilldown-band" id="cusip-drilldown">
          <article className="panel drilldown-panel">
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
                {selectedSecurityStats ? (
                  <div className="metrics dense">
                    <div className="metric"><span>Path Change</span><strong>{formatNumber(selectedSecurityStats.spread_path_change, " bps")}</strong></div>
                    <div className="metric"><span>Bid/Ask Proxy</span><strong>{formatNumber(selectedSecurityStats.bid_ask_proxy_bps, " bps")}</strong></div>
                    <div className="metric"><span>Buy / Sell Trades</span><strong>{selectedSecurityStats.buy_count} / {selectedSecurityStats.sell_count}</strong></div>
                    <div className="metric"><span>Avg Trade Size</span><strong>{formatNumber(selectedSecurityStats.avg_trade_size)}</strong></div>
                    <div className="metric"><span>Buy Par</span><strong>{selectedSecurityStats.buy_par.toLocaleString()}</strong></div>
                    <div className="metric"><span>Sell Par</span><strong>{selectedSecurityStats.sell_par.toLocaleString()}</strong></div>
                    <div className="metric"><span>Other Trades</span><strong>{selectedSecurityStats.other_count.toLocaleString()}</strong></div>
                    <div className="metric"><span>Same Bucket Peers</span><strong>{sameBucketComparables.length.toLocaleString()}</strong></div>
                  </div>
                ) : null}
                <div className="readthrough-list">
                  {selectedSecurity.readthrough.map((item) => <p key={item}>{item}</p>)}
                </div>
                <div className="watch-note-card">
                  <label htmlFor="watchlist-note">Watchlist Note</label>
                  <textarea
                    id="watchlist-note"
                    value={watchlistNotes[selectedSecurity.cusip] ?? ""}
                    onChange={(event) => updateWatchlistNote(selectedSecurity.cusip, event.target.value)}
                    placeholder="Add thesis, follow-up, client context, or execution note for this CUSIP."
                  />
                </div>
                {selectedCusipReadthrough ? (
                  <AnalystReadthrough
                    title="Analyst read-through - CUSIP detail"
                    quote={selectedCusipReadthrough.quote}
                    evidence={selectedCusipReadthrough.evidence}
                    polish={selectedCusipReadthrough.polish}
                  />
                ) : null}
                <div className="reason-tree">
                  <strong>Recommendation Reason Tree</strong>
                  {selectedSecurity.evidence.length ? selectedSecurity.evidence.map((item) => <p key={item}>{item}</p>) : <p>No CUSIP-level evidence was generated.</p>}
                </div>
                <SecurityTradePathChart trades={selectedSecurity.trades} />
                <div className="drilldown-chart-grid">
                  <div className="mini-chart-panel">
                    <h3>Yield History</h3>
                    <SecurityMiniHistoryChart trades={selectedSecurity.trades} metric="yield" />
                  </div>
                  <div className="mini-chart-panel">
                    <h3>Par Amount History</h3>
                    <SecurityMiniHistoryChart trades={selectedSecurity.trades} metric="amount" />
                  </div>
                </div>
                <MiniTable<SecurityCandidate>
                  rows={sameBucketComparables}
                  columns={[
                    { key: "cusip", header: "Same Bucket CUSIP", render: (row) => row.cusip },
                    { key: "signal", header: "Signal", render: (row) => row.signal },
                    { key: "spread", header: "Spread", render: (row) => formatNumber(row.spread_to_benchmark_bps, " bps") },
                    { key: "liq", header: "Liquidity", render: (row) => formatNumber(row.liquidity_score) },
                    { key: "rv", header: "RV", render: (row) => formatNumber(row.rv_score) },
                    { key: "trades", header: "Trades", render: (row) => row.trade_count.toLocaleString() }
                  ]}
                />
                <details className="developer-payload" open>
                  <summary>Selected CUSIP Benchmark Audit</summary>
                  <MiniTable<BenchmarkAuditRow>
                    rows={selectedBenchmarkAuditRows}
                    columns={[
                      { key: "date", header: "Date", render: (row) => row.date },
                      { key: "tenor", header: "Tenor", render: (row) => row.tenor },
                      { key: "yield", header: "Benchmark Yield", render: (row) => formatNumber(row.benchmark_yield, "%") },
                      { key: "source", header: "Source", render: (row) => row.benchmark_source },
                      { key: "n", header: "Obs", render: (row) => row.observation_count.toLocaleString() }
                    ]}
                  />
                </details>
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

          <article className="panel watchlist-panel">
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
                { key: "rv", header: "RV", render: (row) => formatNumber(row.rv_score) },
                { key: "note", header: "Note", render: (row) => watchlistNotes[row.cusip] || "N/A" }
              ]}
            />
          </article>
        </section>
      ) : null}

      {payload && dashboard ? (
        <section className="parity-band final-band" id="narrative-export">
          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>AI Commentary Studio</h2>
                <p>Retrieve market context, review evidence, then generate a desk-ready narrative.</p>
              </div>
            </div>
            <div className="studio-flow">
              <div className="studio-card">
                <span className="eyebrow">01 Retrieve</span>
                <strong>Market Context</strong>
                {dashboard.commentary_studio.market_context.map((item) => (
                  <p key={item.step}>
                    <mark className={`status-chip ${item.status}`}>{item.status}</mark>
                    <b>{item.step}</b>
                    {item.evidence}
                  </p>
                ))}
              </div>
              <div className="studio-card">
                <span className="eyebrow">02 Review</span>
                <strong>Analyst Checks</strong>
                {dashboard.commentary_studio.analyst_review.map((item) => (
                  <p key={item.check}>
                    <mark className={`status-chip ${item.status}`}>{item.status}</mark>
                    <b>{item.check}</b>
                    {item.notes}
                  </p>
                ))}
              </div>
              <div className="studio-card generated">
                <span className="eyebrow">03 Generate</span>
                <strong>{dashboard.commentary_studio.generated_commentary.headline}</strong>
                {dashboard.commentary_studio.generated_commentary.bullets.map((item) => <p key={item}>{item}</p>)}
              </div>
            </div>
            <div className="methodology-block">
              <strong>Client Note</strong>
              <p>{dashboard.commentary_studio.generated_commentary.client_note}</p>
            </div>
            <div className="methodology-block">
              <strong>Internal Note</strong>
              <p>{dashboard.commentary_studio.generated_commentary.internal_note}</p>
            </div>
            <details className="developer-payload">
              <summary>Original Rule Narrative</summary>
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
            </details>
            <details className="developer-payload">
              <summary>AI Context Package</summary>
              <pre className="json-block small">{JSON.stringify(dashboard.analyst_context, null, 2)}</pre>
            </details>
          </article>

          <article className="panel">
            <div className="chart-header">
              <div>
                <h2>Report Export Center</h2>
                <p>Download the report package, chart bundle, audit data, and presentation outline.</p>
              </div>
            </div>
            <div className="export-center">
              <button className="export-tile action primary-export" type="button" onClick={downloadPdfReport}>
                <strong>PDF Report</strong>
                <span>Download a desk-ready PDF summary with methodology, signals, RV, and recommendation pages.</span>
                <em>secondary_market_report.pdf</em>
              </button>
              <button className="export-tile action primary-export" type="button" onClick={downloadPptxReport}>
                <strong>PPTX Deck</strong>
                <span>Download a PowerPoint deck outline as editable slides for review and client distribution.</span>
                <em>secondary_market_deck.pptx</em>
              </button>
              {[
                { label: "Payload JSON", href: downloadHref, file: "nextsr_payload.json", detail: "Model input for NextSR." },
                { label: "Summary MD", href: exportSummaryHref, file: "secondary_market_summary.md", detail: "Lightweight written summary." },
                { label: "HTML Report", href: htmlReportHref, file: "secondary_market_report.html", detail: "Full report page." },
                { label: "Chart Bundle", href: chartDataHref, file: "chart_data_bundle.json", detail: "Chart-ready data package." },
                { label: "Audit Bundle", href: auditDataHref, file: "audit_data_bundle.json", detail: "Data health and governance." },
                { label: "Parity Audit", href: parityAuditHref, file: "streamlit_parity_audit.csv", detail: "Streamlit to Next gap checklist." },
                { label: "PPT Outline", href: pptOutlineHref, file: "ppt_outline.md", detail: "Slide-by-slide deck outline." },
                { label: "Manifest", href: reportManifestHref, file: "report_manifest.json", detail: "Export inventory and provenance." },
                { label: "Screener CSV", href: candidateCsvHref, file: "security_screener.csv", detail: "CUSIP-level scores." },
                { label: "Detail CSV", href: securityDetailHref, file: "security_detail.csv", detail: "Selected drilldown fields." },
                { label: "Benchmark CSV", href: benchmarkCsvHref, file: "benchmark_audit.csv", detail: "Benchmark audit rows." }
              ].filter((item) => item.href).map((item) => (
                <a className="export-tile" href={item.href} download={item.file} key={item.file}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  <em>{item.file}</em>
                </a>
              ))}
              <button className="export-tile action" type="button" onClick={openPrintReport}>
                <strong>Browser Print View</strong>
                <span>Open the HTML report and print/save from the browser if you want a manual PDF fallback.</span>
                <em>browser print</em>
              </button>
              {watchlistCsvHref ? (
                <a className="export-tile" href={watchlistCsvHref} download="watchlist.csv">
                  <strong>Watchlist CSV</strong>
                  <span>Saved CUSIP candidates.</span>
                  <em>watchlist.csv</em>
                </a>
              ) : null}
            </div>
            <details className="developer-payload" open>
              <summary>Admin / Benchmark Policy</summary>
              <div className="methodology-block">
                <strong>{dashboard.admin.methodology_version}</strong>
                <p>{dashboard.admin.benchmark_policy}</p>
              </div>
              <div className="metrics dense">
                <div className="metric"><span>Active Benchmark</span><strong>{dashboard.benchmark_governance.active_source ?? "N/A"}</strong></div>
                <div className="metric"><span>Trade Index Points</span><strong>{dashboard.benchmark_governance.trade_index_points.toLocaleString()}</strong></div>
                <div className="metric"><span>Uploaded AAA MMD Points</span><strong>{dashboard.benchmark_governance.uploaded_mmd_points.toLocaleString()}</strong></div>
                <div className="metric"><span>Fallback Used</span><strong>{dashboard.benchmark_governance.fallback_points_used.toLocaleString()}</strong></div>
              </div>
              <MiniTable
                rows={methodologyLockRows}
                columns={[
                  { key: "topic", header: "Methodology Item", render: (row) => row.topic },
                  { key: "status", header: "Status", render: (row) => row.status },
                  { key: "rule", header: "Locked Rule", render: (row) => row.rule },
                  { key: "evidence", header: "Evidence", render: (row) => row.evidence }
                ]}
              />
            </details>
            <details className="developer-payload" open>
              <summary>Benchmark Governance</summary>
              <div className="methodology-block">
                <strong>{dashboard.benchmark_governance.rating_curve_selector}</strong>
                <p>{dashboard.benchmark_governance.policy}</p>
                <p>Missing active tenors: {dashboard.benchmark_governance.missing_active_tenors.join(", ") || "None"}</p>
              </div>
              <div className="rating-selector-block">
                <div>
                  <span>Displayed Rating View</span>
                  <div className="segmented-control">
                    {dashboard.benchmark_governance.spread_assumptions.map((assumption) => (
                      <button
                        className={ratingCurveView === assumption.rating ? "active" : ""}
                        key={assumption.rating}
                        type="button"
                        onClick={() => setRatingCurveView(assumption.rating)}
                      >
                        {assumption.rating}
                      </button>
                    ))}
                  </div>
                </div>
                <strong>
                  {selectedRatingAssumption
                    ? `${selectedRatingAssumption.rating}: AAA MMD + ${formatNumber(selectedRatingAssumption.spread_bps, " bps")}`
                    : "No rating view selected"}
                </strong>
                <p>
                  This selector is explanatory. The active benchmark remains uploaded AAA MMD; rating assumptions are shown for peer grouping, attribution, and governance review.
                </p>
              </div>
              <MiniTable
                rows={dashboard.benchmark_governance.source_priority}
                columns={[
                  { key: "source", header: "Source", render: (row) => row.source },
                  { key: "status", header: "Status", render: (row) => row.status },
                  { key: "points", header: "Points", render: (row) => row.points.toLocaleString() },
                  { key: "notes", header: "Notes", render: (row) => row.notes }
                ]}
              />
              <MiniTable
                rows={dashboard.benchmark_governance.spread_assumptions}
                columns={[
                  { key: "rating", header: "Rating", render: (row) => row.rating },
                  { key: "spread", header: "Spread Assumption", render: (row) => formatNumber(row.spread_bps, " bps") },
                  { key: "source", header: "Source", render: (row) => row.source }
                ]}
              />
            </details>
            <details className="developer-payload" open>
              <summary>Validation / Deployment Checklist</summary>
              <MiniTable
                rows={validationChecklistRows}
                columns={[
                  { key: "check", header: "Check", render: (row) => row.check },
                  { key: "status", header: "Status", render: (row) => row.status },
                  { key: "detail", header: "Detail", render: (row) => row.detail }
                ]}
              />
            </details>
            <details className="developer-payload">
              <summary>Benchmark Audit</summary>
              <MiniTable<BenchmarkAuditRow>
                rows={dashboard.benchmark_audit.slice(0, previewRowLimit)}
                columns={[
                  { key: "date", header: "Date", render: (row) => row.date },
                  { key: "tenor", header: "Tenor", render: (row) => row.tenor },
                  { key: "yield", header: "Yield", render: (row) => formatNumber(row.benchmark_yield, "%") },
                  { key: "source", header: "Source", render: (row) => row.benchmark_source },
                  { key: "n", header: "Obs", render: (row) => row.observation_count.toLocaleString() }
                ]}
              />
            </details>
            <details className="developer-payload" open={showDeveloperPayload}>
              <summary>Diagnostics Table Browser</summary>
              <div className="split-list">
                <div>
                  <h3>Processed Candidate Preview</h3>
                  <MiniTable<SecurityCandidate>
                    rows={candidates.slice(0, previewRowLimit)}
                    columns={[
                      { key: "cusip", header: "CUSIP", render: (row) => row.cusip },
                      { key: "issuer", header: "Issuer", render: (row) => row.issuer },
                      { key: "bucket", header: "Bucket", render: (row) => row.maturity_bucket },
                      { key: "spread", header: "Spread", render: (row) => formatNumber(row.spread_to_benchmark_bps, " bps") },
                      { key: "liq", header: "Liquidity", render: (row) => formatNumber(row.liquidity_score) }
                    ]}
                  />
                </div>
                <div>
                  <h3>Field Coverage Preview</h3>
                  <MiniTable
                    rows={dashboard.data_audit_center.field_coverage}
                    columns={[
                      { key: "field", header: "Field", render: (row) => row.field },
                      { key: "column", header: "Column", render: (row) => row.detected_column },
                      { key: "coverage", header: "Coverage", render: (row) => `${row.coverage_pct}%` }
                    ]}
                  />
                </div>
              </div>
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
            <details className="developer-payload">
              <summary>Version Changelog</summary>
              <MiniTable
                rows={methodologyChangelog}
                columns={[
                  { key: "version", header: "Version", render: (row) => row.version },
                  { key: "change", header: "Change", render: (row) => row.change }
                ]}
              />
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

      {payload && dashboard ? (
        <section className="panel parity-audit-panel" id="streamlit-parity">
          <div className="toolbar">
            <div>
              <h2>Streamlit Parity Audit</h2>
              <span className="table-count">Original Streamlit surface mapped to the current Next.js product.</span>
            </div>
            {parityAuditHref ? (
              <a className="secondary-button" href={parityAuditHref} download="streamlit_parity_audit.csv">
                Audit CSV
              </a>
            ) : null}
          </div>
          <div className="parity-summary">
            <div className="parity-stat ported"><span>Ported</span><strong>{parityStats.ported}</strong></div>
            <div className="parity-stat next-enhanced"><span>Next Enhanced</span><strong>{parityStats["next-enhanced"]}</strong></div>
            <div className="parity-stat partial"><span>Partial</span><strong>{parityStats.partial}</strong></div>
            <div className="parity-stat missing"><span>Missing</span><strong>{parityStats.missing}</strong></div>
          </div>
          <div className="parity-guidance">
            <strong>What this means</strong>
            <p>Ported means the core workflow exists in Next. Partial means the main analytical idea exists but Streamlit has more controls, charts, or exports. Next enhanced means the new version is intentionally productized beyond the Streamlit page. Missing means the original surface still needs to be built.</p>
          </div>
          <div className="parity-guidance">
            <strong>Next Build Queue</strong>
            <p>Use this as the working checklist for remaining Streamlit parity and product hardening. High-priority partial items should be validated against sample outputs before adding more polish.</p>
          </div>
          <MiniTable
            rows={partialBuildQueue}
            columns={[
              { key: "order", header: "#", render: (row) => row.order },
              { key: "area", header: "Area", render: (row) => row.area },
              { key: "priority", header: "Priority", render: (row) => row.priority },
              { key: "status", header: "Status", render: (row) => row.status },
              { key: "next", header: "Next Step", render: (row) => row.next_step }
            ]}
          />
          <div className="table-wrap parity-table">
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Streamlit Surface</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Current Next Surface</th>
                  <th>Notes</th>
                  <th>Next Step</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.streamlit_parity_audit.map((item) => (
                  <tr key={`${item.area}-${item.streamlit_surface}`}>
                    <td>{item.area}</td>
                    <td>
                      <strong>{item.streamlit_surface}</strong>
                      <span className="source-anchor">{item.source_anchor}</span>
                    </td>
                    <td><mark className={`parity-status ${item.status}`}>{item.status}</mark></td>
                    <td>{item.priority}</td>
                    <td>{item.next_surface}</td>
                    <td>{item.notes}</td>
                    <td>{item.next_step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
