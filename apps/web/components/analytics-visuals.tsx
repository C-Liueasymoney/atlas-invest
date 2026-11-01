"use client";
import { useState } from "react";

export type AnalyticsCell = {
  a: string;
  b: string;
  value: number | null;
  n: number;
  from: string | null;
  to: string | null;
  reason: string | null;
  missingRate: number;
};
export const coefficient = (n: number | null) =>
  n === null ? "—" : n.toFixed(3);
export const missingLabel = (reason: string | null) =>
  ({
    insufficient_samples: "共同样本不足20个",
    zero_variance: "序列无波动，无法计算",
    no_overlap: "没有共同观察区间",
    unsupported: "暂不支持此序列",
  })[reason || ""] ||
  reason ||
  "暂无可计算数据";
export const cellDescription = (cell: AnalyticsCell) =>
  `相关系数 ${coefficient(cell.value)} · 样本 ${cell.n} · 缺失 ${(cell.missingRate * 100).toFixed(1)}% · ${cell.from || "—"} 至 ${cell.to || "—"}${cell.reason ? ` · ${missingLabel(cell.reason)}` : ""}`;
export function CorrelationMatrix({
  assets,
  matrix,
  pair,
  onPair,
}: {
  assets: { id: string; name: string }[];
  matrix: AnalyticsCell[][];
  pair: string[];
  onPair: (pair: string[]) => void;
}) {
  const [hover, setHover] = useState<AnalyticsCell | null>(null);
  return (
    <>
      <div
        className="analytics-matrix-scroll"
        tabIndex={0}
        aria-label="可横向滚动的相关性矩阵"
      >
        <table className="analytics-matrix">
          <caption>相关性热力图 · 点击单元格查看资产对</caption>
          <thead>
            <tr>
              <th scope="col">资产 / 资产</th>
              {assets.map((a) => (
                <th key={a.id} scope="col">
                  {a.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={a.id}>
                <th scope="row">{a.name}</th>
                {assets.map((b, j) => {
                  const cell = matrix[i]?.[j];
                  return (
                    <td key={b.id}>
                      {cell ? (
                        <button
                          aria-label={`${a.name} 与 ${b.name}：${cellDescription(cell)}`}
                          aria-pressed={pair[0] === a.id && pair[1] === b.id}
                          title={cellDescription(cell)}
                          style={{
                            background:
                              cell.value === null
                                ? "var(--panel-hover)"
                                : `color-mix(in srgb, ${cell.value < 0 ? "#387acc" : "#d98740"} ${Math.round(Math.abs(cell.value) * 65 + 8)}%, var(--panel))`,
                          }}
                          onMouseEnter={() => setHover(cell)}
                          onFocus={() => setHover(cell)}
                          onClick={() => onPair([a.id, b.id])}
                        >
                          {coefficient(cell.value)}
                          <small>n={cell.n}</small>
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="analytics-legend">
        <span>−1 负相关</span>
        <i />
        <span>0 无线性相关</span>
        <i />
        <span>+1 正相关</span>
        <span>灰色 — 无法计算</span>
      </p>
      <p className="analytics-cell-detail" role="status">
        {hover
          ? cellDescription(hover)
          : "悬停或键盘聚焦单元格，查看样本、日期与缺失原因。"}
      </p>
    </>
  );
}
export function RollingVisual({
  points,
}: {
  points: { time: string; value: number | null }[];
}) {
  const [start, setStart] = useState(0),
    [end, setEnd] = useState(100),
    [cursor, setCursor] = useState<number | null>(null);
  const lo = Math.floor((points.length * start) / 100),
    hi = Math.max(lo + 1, Math.ceil((points.length * end) / 100));
  const visible = points.slice(lo, hi);
  const x = (i: number) => 48 + (i / Math.max(visible.length - 1, 1)) * 690;
  const y = (n: number) => 28 + (1 - n) * 105;
  const path = visible
    .map((p, i) =>
      p.value === null
        ? ""
        : `${i === 0 || visible[i - 1].value === null ? "M" : "L"}${x(i)},${y(p.value)}`,
    )
    .join(" ");
  const current =
    cursor === null ? undefined : visible[Math.min(cursor, visible.length - 1)];
  if (!points.some((p) => p.value !== null))
    return (
      <p className="empty">
        当前区间没有完整滚动窗口；请扩大日期范围或缩短窗口。
      </p>
    );
  return (
    <div className="analytics-rolling">
      <svg
        viewBox="0 0 770 285"
        role="img"
        aria-label="滚动相关系数曲线，固定纵轴负1至正1。左右方向键查看数据"
        tabIndex={0}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setCursor(
            Math.max(
              0,
              Math.min(
                visible.length - 1,
                Math.round(
                  ((((e.clientX - rect.left) / rect.width) * 770 - 48) / 690) *
                    (visible.length - 1),
                ),
              ),
            ),
          );
        }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            setCursor((i) =>
              Math.max(
                0,
                Math.min(
                  visible.length - 1,
                  (i ?? 0) + (e.key === "ArrowRight" ? 1 : -1),
                ),
              ),
            );
          }
        }}
      >
        {[-1, -0.5, 0, 0.5, 1].map((n) => (
          <g key={n}>
            <line
              x1="48"
              x2="738"
              y1={y(n)}
              y2={y(n)}
              stroke="var(--border)"
              strokeDasharray={n === 0 ? "5 4" : undefined}
            />
            <text x="9" y={y(n) + 4} fill="var(--muted)" fontSize="12">
              {n > 0 ? "+" : ""}
              {n}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--gold)" strokeWidth="2.5" />
        {current && cursor !== null && (
          <g>
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1="28"
              y2="238"
              stroke="var(--muted)"
            />
            {current.value !== null && (
              <circle
                cx={x(cursor)}
                cy={y(current.value)}
                r="4"
                fill="var(--gold)"
              />
            )}
          </g>
        )}
        <text x="48" y="267" fill="var(--muted)" fontSize="12">
          {visible[0]?.time}
        </text>
        <text
          x="738"
          y="267"
          textAnchor="end"
          fill="var(--muted)"
          fontSize="12"
        >
          {visible.at(-1)?.time}
        </text>
      </svg>
      <p role="status" className="analytics-chart-tooltip">
        {current
          ? `${current.time} · 相关系数 ${coefficient(current.value)}`
          : "移动指针或使用左右方向键查看日期与系数"}
      </p>
      <div className="analytics-zoom">
        <label>
          缩放起点
          <input
            aria-label="缩放起点"
            type="range"
            min="0"
            max="99"
            value={start}
            onChange={(e) => {
              setStart(Math.min(Number(e.target.value), end - 1));
              setCursor(null);
            }}
          />
        </label>
        <label>
          缩放终点
          <input
            aria-label="缩放终点"
            type="range"
            min="1"
            max="100"
            value={end}
            onChange={(e) => {
              setEnd(Math.max(Number(e.target.value), start + 1));
              setCursor(null);
            }}
          />
        </label>
        <button
          onClick={() => {
            setStart(0);
            setEnd(100);
            setCursor(null);
          }}
        >
          重置缩放
        </button>
      </div>
    </div>
  );
}
export function PairRelationship({
  pairs,
  a,
  b,
  aBp,
  bBp,
}: {
  pairs: { time: string; x: number; y: number }[];
  a: string;
  b: string;
  aBp: boolean;
  bBp: boolean;
}) {
  const [table, setTable] = useState(false);
  const axis = (value: number, bp: boolean) =>
    `${(value * (bp ? 1 : 100)).toFixed(2)}${bp ? " bp" : "%"}`;
  const maxX = Math.max(...pairs.map((p) => Math.abs(p.x)), 0.0001),
    maxY = Math.max(...pairs.map((p) => Math.abs(p.y)), 0.0001);
  return (
    <section className="analytics-relationship">
      <div className="analytics-section-title">
        <h3>配对变动关系</h3>
        <button aria-pressed={table} onClick={() => setTable((v) => !v)}>
          {table ? "查看散点图" : "查看数据表"}
        </button>
      </div>
      <p className="muted small">
        横轴：{a}（{aBp ? "基点变化" : "收益率"}） · 纵轴：{b}（
        {bBp ? "基点变化" : "收益率"}） · {pairs.length} 个共同区间
      </p>
      {!pairs.length ? (
        <p className="empty">没有共同区间的变动值。</p>
      ) : table ? (
        <div className="analytics-pairs-scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>{a}</th>
                <th>{b}</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={p.time}>
                  <td>{p.time}</td>
                  <td>{axis(p.x, aBp)}</td>
                  <td>{axis(p.y, bBp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox="0 0 770 280"
          role="img"
          aria-label={`${a}与${b}的配对变动散点图`}
        >
          <line x1="60" x2="720" y1="135" y2="135" stroke="var(--border)" />
          <line x1="390" x2="390" y1="20" y2="240" stroke="var(--border)" />
          {pairs.map((p) => (
            <circle
              key={p.time}
              cx={390 + (p.x / maxX) * 310}
              cy={135 - (p.y / maxY) * 100}
              r="3.5"
              fill="var(--gold)"
              opacity=".65"
            >
              <title>
                {p.time} · {a} {axis(p.x, aBp)} · {b} {axis(p.y, bBp)}
              </title>
            </circle>
          ))}
          <text x="60" y="265" fill="var(--muted)" fontSize="12">
            {axis(-maxX, aBp)}
          </text>
          <text
            x="720"
            y="265"
            textAnchor="end"
            fill="var(--muted)"
            fontSize="12"
          >
            {axis(maxX, aBp)}
          </text>
          <text x="5" y="20" fill="var(--muted)" fontSize="12">
            {axis(maxY, bBp)}
          </text>
          <text x="5" y="240" fill="var(--muted)" fontSize="12">
            {axis(-maxY, bBp)}
          </text>
        </svg>
      )}
    </section>
  );
}
