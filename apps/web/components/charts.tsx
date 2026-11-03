"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineType,
  type Time,
} from "lightweight-charts";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import {
  dateTime,
  unitLabel,
  frequencyLabel,
  Envelope,
  Series,
  formatValue,
  useRemote,
  type Quote,
} from "./api";
import { withLatestQuote } from "../lib/chart-latest";
import { Badge, Empty, ErrorNotice, Loading } from "./ui";
import { ranges, rangeFrom } from "../lib/chart-range";
import { YearRange } from "./year-range";
export { ranges, rangeFrom } from "../lib/chart-range";
export function PriceChart({
  seriesId,
  range: initialRange = "1Y",
  chartType: initialType = "line",
  onConfig,
  compact = false,
  latestQuote,
  history,
}: {
  seriesId: string;
  range?: string;
  chartType?: string;
  onConfig?: (patch: { range?: string; chartType?: string }) => void;
  compact?: boolean;
  latestQuote?: Quote;
  history?: Envelope;
}) {
  const [range, setRange] = useState(initialRange);
  const [type, setType] = useState(initialType);
  const metadata = useRemote<Series>(
    `/api/v1/series/${encodeURIComponent(seriesId)}/metadata`,
  );
  const remote = useRemote<Envelope>(
    metadata.data && !history
      ? `/api/v1/series/${encodeURIComponent(seriesId)}/${metadata.data.kind === "ohlc" ? "bars" : "observations"}?interval=1d&from=${rangeFrom(range)}`
      : null,
  );
  const data = history
    ? {
        ...history,
        points: history.points.filter((p) => p.time >= rangeFrom(range)),
      }
    : remote.data;
  const plotted = data
    ? withLatestQuote(data.points, latestQuote, data.series.timezone)
    : [];
  const hasOhlc = !!data?.points.some(
    (p) => p.open != null && p.high != null && p.low != null && p.close != null,
  );
  const actualType = hasOhlc && type === "candlestick" ? "candlestick" : "line";
  return (
    <div
      className={`price-chart ${compact ? "compact-chart" : ""}`}
      data-chart-points={plotted.length}
    >
      <div className="chart-toolbar">
        <div className="range-buttons">
          {ranges.map((r) => (
            <button
              key={r}
              className={range === r ? "selected" : ""}
              onClick={() => {
                setRange(r);
                onConfig?.({ range: r });
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <YearRange
          onChange={(next) => {
            setRange(next);
            onConfig?.({ range: next });
          }}
        />
        <div className="chart-mode">
          <button
            className={actualType === "line" ? "selected" : ""}
            aria-label="折线图"
            onClick={() => {
              setType("line");
              onConfig?.({ chartType: "line" });
            }}
          >
            折线
          </button>
          {hasOhlc && (
            <button
              className={actualType === "candlestick" ? "selected" : ""}
              onClick={() => {
                setType("candlestick");
                onConfig?.({ chartType: "candlestick" });
              }}
            >
              日K
            </button>
          )}
        </div>
      </div>
      <ErrorNotice
        message={remote.error || metadata.error}
        retry={() => {
          remote.refresh();
          metadata.refresh();
        }}
      />
      {(!history && remote.loading) || metadata.loading ? (
        <Loading />
      ) : data &&
        plotted.some((p) => p.value !== null || p.close !== undefined) ? (
        <ChartCanvas
          type={actualType}
          lines={[
            {
              name: data.series.nameZh,
              color: "#2962ff",
              points: (actualType === "line" ? plotted : data.points).map(
                (p) => ({
                  time: p.time,
                  value: p.value === null ? null : Number(p.value),
                  ...(p.open !== undefined
                    ? {
                        open: Number(p.open),
                        high: Number(p.high),
                        low: Number(p.low),
                        close: Number(p.close),
                      }
                    : {}),
                }),
              ),
            },
          ]}
          step={["monthly", "weekly", "1mo", "1w"].includes(
            data.series.frequency,
          )}
        />
      ) : (
        <Empty>
          <ChartNoAxesCombined size={26} />
          <span>{data?.message || "此区间暂无可用数据"}</span>
          <Link href="/settings/data-sources">
            检查数据源与采集状态 <ArrowUpRight size={13} />
          </Link>
        </Empty>
      )}
      {data && (
        <div className="chart-provenance">
          {history && (
            <p>
              历史范围以来源当前可提供的近期日线为限（约320条）；最新报价点单独展示。
            </p>
          )}
          {latestQuote && !latestQuote.isDemo && latestQuote.value != null && (
            <p data-testid="chart-latest-point" data-value={latestQuote.value}>
              最新报价点 {formatValue(latestQuote.value)}{" "}
              {unitLabel(latestQuote.unit)} · {latestQuote.source.label} ·{" "}
              {latestQuote.asOfKind === "date"
                ? latestQuote.asOf
                : dateTime(latestQuote.asOf)}{" "}
              · 折线末端参考报价，非新增日收盘
            </p>
          )}
          <div>
            <Badge status={data.isDemo ? "demo" : data.status} />
            <span>
              {unitLabel(data.unit)} · {frequencyLabel(data.series.frequency)} ·
              {data.series.timezone}
            </span>
          </div>
          <div>
            <a href={data.source.url} target="_blank" rel="noreferrer">
              {data.source.label}
            </a>
            <span>
              数据截至 {data.asOf?.slice(0, 10) || "—"} · 采集{" "}
              {dateTime(data.fetchedAt)}
            </span>
          </div>
          {data.sourceChanged && <p>数据来源已变更，请核对口径与原始日期。</p>}
          {data.message && <p>{data.message}</p>}
        </div>
      )}
      <div className="chart-attribution">
        图表由{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>{" "}
        提供
      </div>
    </div>
  );
}
export type ChartLine = {
  name: string;
  color: string;
  points: {
    time: string;
    value: number | null;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  }[];
};
export function ChartCanvas({
  lines,
  type = "line",
  step = false,
}: {
  lines: ChartLine[];
  type?: string;
  step?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState("");
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const style = getComputedStyle(document.documentElement);
    const chart = createChart(el, {
      autoSize: false,
      width: el.clientWidth,
      height: Math.max(150, el.clientHeight),
      layout: {
        background: {
          type: ColorType.Solid,
          color: style.getPropertyValue("--panel").trim() || "#12171f",
        },
        textColor: style.getPropertyValue("--muted").trim() || "#8490a5",
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: {
          color: style.getPropertyValue("--grid").trim() || "#1d2531",
        },
        horzLines: {
          color: style.getPropertyValue("--grid").trim() || "#1d2531",
        },
      },
      rightPriceScale: {
        borderColor: style.getPropertyValue("--border").trim(),
        borderVisible: false,
      },
      timeScale: {
        borderColor: style.getPropertyValue("--border").trim(),
        timeVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { labelBackgroundColor: "#46556b" },
        horzLine: { labelBackgroundColor: "#46556b" },
      },
      handleScroll: true,
      handleScale: true,
    });
    for (const line of lines) {
      if (type === "candlestick") {
        const series = chart.addSeries(CandlestickSeries, {
          upColor: style.getPropertyValue("--positive").trim(),
          downColor: style.getPropertyValue("--negative").trim(),
          borderVisible: false,
          wickUpColor: style.getPropertyValue("--positive").trim(),
          wickDownColor: style.getPropertyValue("--negative").trim(),
        });
        series.setData(
          line.points
            .filter((p) =>
              [p.open, p.high, p.low, p.close].every(
                (v) => typeof v === "number" && Number.isFinite(v),
              ),
            )
            .map((p) => ({
              time: p.time as Time,
              open: p.open!,
              high: p.high!,
              low: p.low!,
              close: p.close!,
            })),
        );
      } else if (lines.length === 1 && !step) {
        const series = chart.addSeries(AreaSeries, {
          lineColor: line.color,
          topColor: "rgba(41,98,255,0.16)",
          bottomColor: "rgba(41,98,255,0.005)",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: line.name.includes("汇率") ? 4 : 2,
            minMove: line.name.includes("汇率") ? 0.0001 : 0.01,
          },
        });
        series.setData(
          line.points.map((p) =>
            p.value !== null && Number.isFinite(p.value)
              ? { time: p.time as Time, value: p.value }
              : { time: p.time as Time },
          ),
        );
      } else {
        const series = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 2,
          title: lines.length > 1 ? line.name : undefined,
          lineType: step ? LineType.WithSteps : LineType.Simple,
          priceFormat: { type: "price", precision: 3, minMove: 0.001 },
        });
        series.setData(
          line.points.map((p) =>
            p.value !== null && Number.isFinite(p.value)
              ? { time: p.time as Time, value: p.value }
              : { time: p.time as Time },
          ),
        );
      }
    }
    const dates = lines
      .flatMap((line) => line.points.map((point) => point.time))
      .sort();
    const fitRange = () => {
      if (dates.length > 1 && dates[0] !== dates[dates.length - 1])
        chart.timeScale().setVisibleRange({
          from: dates[0] as Time,
          to: dates[dates.length - 1] as Time,
        });
      else chart.timeScale().fitContent();
    };
    fitRange();
    let previousWidth = 0;
    const sizeObserver = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = Math.max(150, entry.contentRect.height);
      chart.resize(width, height, true);
      if (width !== previousWidth) {
        previousWidth = width;
        fitRange();
      }
    });
    sizeObserver.observe(el);
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHover("");
        return;
      }
      const values = [...param.seriesData.values()].map((p) =>
        "value" in p
          ? formatValue(p.value)
          : "close" in p
            ? `O ${formatValue(p.open)} H ${formatValue(p.high)} L ${formatValue(p.low)} C ${formatValue(p.close)}`
            : "",
      );
      setHover(
        `${typeof param.time === "string" ? param.time : ""}  ${values.join(" · ")}`,
      );
    });
    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.colors) {
        for (const series of chart.panes().flatMap((p) => p.getSeries())) {
          if (series.seriesType() === "Candlestick") {
            const colors = getComputedStyle(document.documentElement);
            series.applyOptions({
              upColor: colors.getPropertyValue("--positive").trim(),
              downColor: colors.getPropertyValue("--negative").trim(),
              wickUpColor: colors.getPropertyValue("--positive").trim(),
              wickDownColor: colors.getPropertyValue("--negative").trim(),
            });
          }
        }
      }
      const next = getComputedStyle(document.documentElement);
      chart.applyOptions({
        layout: {
          background: {
            type: ColorType.Solid,
            color: next.getPropertyValue("--panel").trim(),
          },
          textColor: next.getPropertyValue("--muted").trim(),
        },
        grid: {
          vertLines: { color: next.getPropertyValue("--grid").trim() },
          horzLines: { color: next.getPropertyValue("--grid").trim() },
        },
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-colors"],
    });
    return () => {
      observer.disconnect();
      sizeObserver.disconnect();
      chart.remove();
    };
  }, [lines, type, step]);
  return (
    <div className="chart-canvas-wrap">
      <div className="chart-hover" aria-live="off">
        {hover || (
          <>
            <span className="chart-desktop-hint">
              移动光标查看历史观测 · 滚轮缩放
            </span>
            <span className="chart-touch-hint">
              长按后拖动查看日期和数值 · 双指缩放
            </span>
          </>
        )}
      </div>
      <div
        ref={ref}
        className="chart-canvas"
        aria-label="历史数据交互图表"
        role="img"
      />
    </div>
  );
}
