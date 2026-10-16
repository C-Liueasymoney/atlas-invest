"use client";
import { useState } from "react";
import { ChartCanvas, type ChartLine } from "./charts";
import { Series, useRemote } from "./api";
import { Badge, Empty, ErrorNotice, Loading, PageHeading } from "./ui";
const colors = ["#d8b979", "#78a9ec", "#9a89cf", "#5dbba7", "#e38b9e"];
type CompareData = {
  series: {
    id: string;
    nameZh: string;
    unit: string;
    points: { time: string; value: number | null }[];
    status: string;
    isDemo: boolean;
  }[];
  alignment: string;
  mode: string;
};
export function CompareChart({
  ids,
  mode = "index100",
  from = "",
  to = "",
}: {
  ids: string[];
  mode?: string;
  from?: string;
  to?: string;
}) {
  const remote = useRemote<CompareData>(
    ids.length > 1
      ? `/api/v1/compare?seriesIds=${ids.join(",")}&mode=${mode}&align=intersection&from=${from}&to=${to}`
      : null,
  );
  const data = remote.data;
  const lines: ChartLine[] =
    data?.series.map((s, i) => ({
      name: s.nameZh,
      color: colors[i % colors.length],
      points: s.points,
    })) || [];
  return (
    <div className="compare-chart">
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {ids.length < 2 ? (
        <Empty>请选择至少两项指标，开始比较。</Empty>
      ) : remote.loading ? (
        <Loading />
      ) : data?.series.some((s) => s.points.some((p) => p.value !== null)) ? (
        <>
          <div className="chart-legend">
            {data.series.map((s, i) => (
              <span key={s.id}>
                <i style={{ background: colors[i % colors.length] }} />
                {s.nameZh}
                <Badge status={s.isDemo ? "demo" : s.status} />
              </span>
            ))}
          </div>
          <ChartCanvas lines={lines} />
          <p className="chart-provenance">
            {mode === "index100"
              ? "区间起点 = 100"
              : mode === "pct"
                ? "相对区间起点变化 (%)"
                : "原始观测值"}{" "}
            · 对齐：共同观察日期 · 未进行前向填充或日度插值
          </p>
        </>
      ) : (
        <Empty>所选日期范围没有共同可用的观测点。请扩大区间或更换指标。</Empty>
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
export function CompareWorkspace() {
  const catalog = useRemote<{ items: Series[] }>("/api/v1/catalog");
  const [ids, setIds] = useState(["SGE_AU9999_D1", "FRED_DFII10"]);
  const [mode, setMode] = useState("index100");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="CONNECT THE DOTS"
        title="图表工作台"
        description="对照黄金与宏观因子。相关性是研究起点，而不是因果结论。"
      />
      <div className="compare-layout">
        <aside className="panel compare-controls">
          <h2>研究序列</h2>
          <p className="muted small">选取 2–5 项指标，按实际观测日期对齐。</p>
          <ErrorNotice message={catalog.error} />
          {catalog.data?.items.map((s) => (
            <label className="checkbox series-checkbox" key={s.id}>
              <input
                type="checkbox"
                checked={ids.includes(s.id)}
                disabled={ids.length >= 5 && !ids.includes(s.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, s.id]
                      : ids.filter((id) => id !== s.id),
                  )
                }
              />
              <span>
                {s.nameZh}
                <small>
                  {s.providerSymbol} · {s.unit}
                </small>
              </span>
            </label>
          ))}
          <hr />
          <label>
            比较方式
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="index100">标准化 · 起点 = 100</option>
              <option value="pct">区间百分比变动</option>
            </select>
          </label>
          <label>
            开始日期
            <input
              aria-label="比较开始日期"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            结束日期
            <input
              aria-label="比较结束日期"
              type="date"
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <p className="muted small">
            不同单位不混用原始数值轴。收益率跨零时，标准化指数或百分比变化可能不适用。
          </p>
        </aside>
        <section className="panel compare-main">
          <div className="panel-heading">
            <div>
              <h2>跨指标比较</h2>
              <p>{ids.length} 项序列 · 日度观察点 · Asia/Shanghai</p>
            </div>
          </div>
          <CompareChart ids={ids} mode={mode} from={from} to={to} />
        </section>
      </div>
    </>
  );
}
