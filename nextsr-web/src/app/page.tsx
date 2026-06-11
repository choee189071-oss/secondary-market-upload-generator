"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from "react";
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

function BarMetricChart<T>({ data, label, value, tone = "teal" }: { data: T[]; label: (point: T) => string; value: (point: T) => number | null; tone?: "teal" | "rose" | "blue" }) {
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
                className={`bar ${tone}`}
                height={height}
                width={Math.max(7, barWidth - 8)}
                x={x}
                y={230 - height}
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

function IssuerCurveChart({ data, showIssuer = true, showBenchmark = true }: { data: CurvePoint[]; showIssuer?: boolean; showBenchmark?: boolean }) {
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
  }, [data, showIssuer, showBenchmark]);

  const zoomStart = zoomRange?.[0] ?? 0;
  const plotData = zoomRange ? sortedData.slice(zoomRange[0], zoomRange[1] + 1) : sortedData;
  const values = plotData
    .flatMap((point) => [
      showIssuer ? point.issuer_yield : null,
      showBenchmark ? point.benchmark_yield : null
    ])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (!plotData.length || !values.length) {
    return <EmptyChart />;
  }
  const min = Math.min(...values) - 0.15;
  const max = Math.max(...values) + 0.15;
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
  const visibleSeries = (point: CurvePoint) => [
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
              <text className="axis-label" x="10" y={yy + 4}>{label.toFixed(2)}%</text>
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
        {showBenchmark ? <polyline className="line benchmark" points={linePath(plotData, x, (point) => y(point.benchmark_yield))} /> : null}
        {showIssuer ? <polyline className="line issuer" points={linePath(plotData, x, (point) => y(point.issuer_yield))} /> : null}
        {crosshair ? (
          <g className="crosshair">
            <line x1={crosshair.x} x2={crosshair.x} y1="56" y2="300" />
            <line x1="42" x2="758" y1={crosshair.y} y2={crosshair.y} />
            <circle className={crosshair.series === "Benchmark" ? "benchmark-focus" : undefined} cx={crosshair.x} cy={crosshair.y} r="5" />
          </g>
        ) : null}
        {showBenchmark
          ? plotData.filter((point) => point.benchmark_yield !== null).map((point) => (
              <circle
                className="dot benchmark-dot"
                cx={x(point)}
                cy={y(point.benchmark_yield) ?? 0}
                key={`${point.maturity_bucket}-benchmark`}
                r="3.2"
              />
            ))
          : null}
        {showIssuer
          ? plotData.filter((point) => point.issuer_yield !== null).map((point) => (
              <circle
                className="dot issuer-dot"
                cx={x(point)}
                cy={y(point.issuer_yield) ?? 0}
                key={point.maturity_bucket}
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

function SpreadTrendChart({ data }: { data: TrendPoint[] }) {
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
  const values = plotData.map((point) => point.spread_bps);
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

function PositioningChart({ data, selectedCusip, onSelect }: { data: PositionPoint[]; selectedCusip?: string; onSelect?: (cusip: string) => void }) {
  const points = data.filter((point) => point.spread_bps !== null && point.liquidity_score !== null);
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  if (!points.length) {
    return <EmptyChart />;
  }
  const spreads = points.map((point) => point.spread_bps ?? 0);
  const minSpread = Math.min(...spreads) - 5;
  const maxSpread = Math.max(...spreads) + 5;
  const x = (value: number | null) => 42 + ((value ?? 0) / 100) * 716;
  const y = (value: number | null) => 300 - (((value ?? 0) - minSpread) / (maxSpread - minSpread || 1)) * 244;
  return (
    <div className="chart-frame">
      <svg className="chart-svg" viewBox="0 0 800 340" role="img" onMouseLeave={() => setTooltip(null)}>
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
            onMouseMove={(event) => setTooltip(chartTooltipFromEvent(event, point.cusip, [
              `Signal: ${point.signal}`,
              `Spread: ${formatNumber(point.spread_bps, " bps")}`,
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
  const [trendRange, setTrendRange] = useState("90");
  const [candidateSort, setCandidateSort] = useState("rv_score");
  const [candidateLimit, setCandidateLimit] = useState(25);
  const [candidateView, setCandidateView] = useState("all");
  const [tableDensity, setTableDensity] = useState("compact");
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
    window.localStorage.setItem("nextsr-watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  const jsonText = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ""), [payload]);
  const visibleSpreadTrend = useMemo(() => {
    const source = dashboard?.spread_trend ?? [];
    if (trendRange === "all" || source.length < 2) {
      return source;
    }
    const days = Number(trendRange);
    const latest = new Date(`${source[source.length - 1].date}T00:00:00Z`);
    const cutoff = new Date(latest);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    return source.filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoff.getTime());
  }, [dashboard, trendRange]);
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
                <p>{payload.maturity_bucket ?? "Selected bucket"} spread to benchmark · {visibleSpreadTrend.length.toLocaleString()} point(s).</p>
              </div>
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
            </div>
            <SpreadTrendChart data={visibleSpreadTrend} />
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
                <SecurityTradePathChart trades={selectedSecurity.trades} />
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
