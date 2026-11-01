"use client";
import { useEffect, useRef, useState } from "react";
import { api, json, statusLabel } from "./api";
import { Empty, ErrorNotice, Loading, PageHeading } from "./ui";
import {
  CorrelationMatrix,
  RollingVisual,
  PairRelationship,
  coefficient,
  cellDescription,
  type AnalyticsCell,
} from "./analytics-visuals";
import "./analytics.css";

type Frequency = "daily" | "weekly" | "monthly";
type Currency = "CNY" | "USD";
type Asset = {
  id: string;
  name: string;
  currency: string;
  unit: string;
  transform: "return" | "bp-change" | "unsupported";
  status: string;
  source: { id: string; label: string; url: string };
  asOf: string | null;
  fetchedAt: string | null;
  count: number;
  reason?: string | null;
};
type Analysis = {
  assets: Asset[];
  matrix: AnalyticsCell[][];
  frequency: Frequency;
  currency: Currency;
  from: string;
  to: string;
  isDemo: boolean;
  algorithm: string;
  warnings: string[];
};
type Rolling = {
  points: { time: string; value: number | null }[];
  pairs: { time: string; x: number; y: number }[];
  cell: AnalyticsCell;
  window: number;
  warnings: string[];
  isDemo: boolean;
};
export type CorrelationConfig = {
  assets: string[];
  range: string;
  from: string;
  to: string;
  frequency: Frequency;
  currency: Currency;
  window: number;
};
export type CorrelationAnalyticsProps = {
  compact?: boolean;
  initialAssets?: string[];
  initialRange?: string | { from: string; to: string };
  initialFrequency?: Frequency;
  initialCurrency?: Currency;
  initialWindow?: number;
  rollingOnly?: boolean;
  onConfig?: (config: CorrelationConfig) => void;
};
const defaults = ["SGE_AU9999_D1", "FX_USDCNY_D1", "FRED_NASDAQ100"];
const today = () => new Date().toISOString().slice(0, 10);
function rangeDates(range: string) {
  const to = today(),
    from = new Date(to + "T00:00:00Z");
  from.setUTCFullYear(
    from.getUTCFullYear() - (range === "5Y" ? 5 : range === "3Y" ? 3 : 1),
  );
  return { from: from.toISOString().slice(0, 10), to };
}
// Store the request key with every response, so changing controls never relabels old data.
function useAnalysisRequest<T>(path: string | null, version: number) {
  const key = `${path}:${version}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [path, key]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error || "" : "",
    loading: !!path && result?.key !== key,
  };
}
function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(
    [
      "\uFEFF" +
        rows
          .map((row) =>
            row
              .map((v) => {
                const text = String(v ?? "");
                return (
                  '"' +
                  (/^[=+\-@]/.test(text) && typeof v !== "number" ? "'" : "") +
                  text.replaceAll('"', '""') +
                  '"'
                );
              })
              .join(","),
          )
          .join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CorrelationAnalytics({
  compact = false,
  initialAssets = defaults,
  initialRange = "1Y",
  initialFrequency = "daily",
  initialCurrency = "CNY",
  initialWindow = 60,
  rollingOnly = false,
  onConfig,
}: CorrelationAnalyticsProps) {
  const [assets, setAssets] = useState(
    [...new Set(initialAssets)].slice(0, 10),
  );
  const [range, setRange] = useState(
    typeof initialRange === "string" ? initialRange : "custom",
  );
  const [dates, setDates] = useState(
    typeof initialRange === "object" ? initialRange : rangeDates(initialRange),
  );
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency),
    [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [window, setWindow] = useState(
    [30, 60, 120, 252].includes(initialWindow) ? initialWindow : 60,
  );
  const [search, setSearch] = useState(""),
    [version, setVersion] = useState(0),
    [refreshing, setRefreshing] = useState(false),
    [message, setMessage] = useState("");
  const [pickedPair, setPickedPair] = useState(initialAssets.slice(0, 2));
  const pair =
    pickedPair.length === 2 && pickedPair.every((id) => assets.includes(id))
      ? pickedPair
      : assets.slice(0, 2);
  const configRef = useRef(onConfig);
  useEffect(() => {
    configRef.current = onConfig;
  }, [onConfig]);
  const assetKey = assets.join(",");
  useEffect(() => {
    if (
      assetKey.split(",").filter(Boolean).length < 2 ||
      !dates.from ||
      !dates.to ||
      dates.from > dates.to ||
      dates.to > today()
    )
      return;
    configRef.current?.({
      assets: assetKey.split(",").filter(Boolean),
      range,
      from: dates.from,
      to: dates.to,
      frequency,
      currency,
      window,
    });
  }, [assetKey, range, dates.from, dates.to, frequency, currency, window]);
  const availability = useAnalysisRequest<{ items: Asset[] }>(
    "/api/v1/analytics/assets/availability",
    version,
  );
  const invalid =
    assets.length < 2
      ? "请选择至少两项资产。"
      : !dates.from || !dates.to || dates.from > dates.to || dates.to > today()
        ? "请选择有效日期区间，结束日期不可晚于今天。"
        : Date.parse(dates.to) - Date.parse(dates.from) > 11 * 366 * 86400000
          ? "单次分析最多11年。"
          : "";
  const params = new URLSearchParams({
    assets: assetKey,
    from: dates.from,
    to: dates.to,
    frequency,
    currency,
  });
  const matrixRequest = useAnalysisRequest<Analysis>(
    !invalid ? `/api/v1/analytics/correlation?${params}` : null,
    version,
  );
  params.set("a", pair[0] || "");
  params.set("b", pair[1] || "");
  params.set("window", String(window));
  const rollingRequest = useAnalysisRequest<Rolling>(
    !invalid ? `/api/v1/analytics/correlation/rolling?${params}` : null,
    version,
  );
  const data = !invalid ? matrixRequest.data : undefined,
    rolling = !invalid ? rollingRequest.data : undefined;
  const catalog = availability.data?.items || data?.assets || [];
  const name = (id: string) =>
    catalog.find((a) => a.id === id)?.name ||
    data?.assets.find((a) => a.id === id)?.name ||
    id;
  const cells =
    data?.matrix
      .flat()
      .filter((c) => c.a !== c.b && c.a < c.b && c.value !== null) || [];
  const lowest = cells.reduce<AnalyticsCell | undefined>(
    (best, c) => (!best || c.value! < best.value! ? c : best),
    undefined,
  );
  const highest = cells
    .filter((c) => c.value! > 0)
    .reduce<AnalyticsCell | undefined>(
      (best, c) => (!best || c.value! > best.value! ? c : best),
      undefined,
    );
  const strongest = cells.reduce<AnalyticsCell | undefined>(
    (best, cell) =>
      !best || Math.abs(cell.value!) > Math.abs(best.value!) ? cell : best,
    undefined,
  );
  const mean = cells.length
    ? cells.reduce((sum, c) => sum + c.value!, 0) / cells.length
    : null;
  const updateAssets = (ids: string[]) =>
    setAssets([...new Set(ids)].slice(0, rollingOnly ? 2 : 10));
  async function refresh() {
    setRefreshing(true);
    setMessage("");
    try {
      const refreshResult = await api<{
        items: { id: string; status: string; message?: string }[];
      }>(
        "/api/v1/analytics/refresh",
        json("POST", { assets, from: dates.from, to: dates.to }),
      );
      setMessage(
        refreshResult.items.some((i) => i.status !== "requested")
          ? refreshResult.items
              .filter((i) => i.status !== "requested")
              .map((i) => `${name(i.id)}：${i.message || "同步不可用"}`)
              .join("；")
          : "刷新任务已返回；各序列的可用状态与来源见下方。",
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <div
      className={`analytics-correlation ${compact ? "analytics-compact" : ""}`}
    >
      {!compact && (
        <PageHeading
          eyebrow="CROSS-ASSET RESEARCH"
          title="资产相关性分析"
          description="以共同区间的收益率与基点变化观察关联；相关性不代表因果，也不预测未来。"
        />
      )}
      <div className="analytics-controls panel">
        <div className="analytics-section-title">
          <h2>{rollingOnly ? "滚动相关性" : "相关性研究"}</h2>
          <button disabled={refreshing || !assets.length} onClick={refresh}>
            {refreshing ? "正在刷新…" : "刷新分析数据"}
          </button>
        </div>
        <details open={!compact}>
          <summary>选择资产 · 已选 {assets.length}/10</summary>
          <label className="analytics-search">
            搜索资产
            <input
              type="search"
              placeholder="名称、代码或来源"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="analytics-quick">
            <span>快速加入</span>
            {[
              ["美国利率", ["FRED_DFII10", "FRED_DGS10"]],
              ["美元兑人民币", ["FX_USDCNY_D1"]],
              ["国际黄金", ["XAUUSD_QUOTE"]],
            ].map(([label, ids]) => (
              <button
                key={String(label)}
                onClick={() => updateAssets([...assets, ...(ids as string[])])}
              >
                {label}
              </button>
            ))}
          </div>
          <ErrorNotice
            message={availability.error}
            retry={() => setVersion((v) => v + 1)}
          />
          <div className="analytics-catalog">
            {catalog
              .filter((a) =>
                `${a.name} ${a.id} ${a.source.label}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((a) => (
                <label key={a.id} className="analytics-asset">
                  <input
                    type="checkbox"
                    checked={assets.includes(a.id)}
                    disabled={assets.length >= 10 && !assets.includes(a.id)}
                    onChange={(e) =>
                      updateAssets(
                        e.target.checked
                          ? [...assets, a.id]
                          : assets.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <span>
                    {a.name}
                    <small>
                      {a.id} ·{" "}
                      {a.transform === "bp-change"
                        ? "基点变化"
                        : a.transform === "return"
                          ? "收益率"
                          : "暂不支持分析"}{" "}
                      · {statusLabel[a.status] || a.status}
                    </small>
                    {a.reason && <small>{a.reason}</small>}
                  </span>
                </label>
              ))}
          </div>
        </details>
        <div className="analytics-selected" aria-label="已选资产">
          {assets.map((id) => (
            <button
              key={id}
              onClick={() => updateAssets(assets.filter((a) => a !== id))}
              aria-label={`移除${name(id)}`}
            >
              {name(id)} ×
            </button>
          ))}
        </div>
        <div className="analytics-filters">
          <label>
            日期范围
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                if (e.target.value !== "custom")
                  setDates(rangeDates(e.target.value));
              }}
            >
              <option value="1Y">1Y · 一年</option>
              <option value="3Y">3Y · 三年</option>
              <option value="5Y">5Y · 五年</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <label>
            开始日期
            <input
              type="date"
              value={dates.from}
              max={dates.to}
              onChange={(e) => {
                setRange("custom");
                setDates({ ...dates, from: e.target.value });
              }}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={dates.to}
              min={dates.from}
              max={today()}
              onChange={(e) => {
                setRange("custom");
                setDates({ ...dates, to: e.target.value });
              }}
            />
          </label>
          <label>
            采样频率
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              <option value="daily">日度</option>
              <option value="weekly">周度（ISO周）</option>
              <option value="monthly">月度</option>
            </select>
          </label>
          <label>
            计价货币
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="CNY">CNY · 人民币</option>
              <option value="USD">USD · 美元</option>
            </select>
          </label>
        </div>
        {message && <p role="status">{message}</p>}
        {invalid && <p role="alert">{invalid}</p>}
      </div>
      <ErrorNotice
        message={matrixRequest.error}
        retry={() => setVersion((v) => v + 1)}
      />
      {matrixRequest.loading && <Loading />}
      {(data?.isDemo || rolling?.isDemo) && (
        <p className="notice analytics-demo" role="status">
          DEMO 演示数据 · 合成序列仅用于功能演示，不代表真实市场。
        </p>
      )}
      {data && (
        <>
          {!rollingOnly && (
            <section className="panel analytics-matrix-panel">
              <div className="analytics-section-title">
                <h2>相关性矩阵</h2>
                <button
                  onClick={() =>
                    downloadCsv("correlation-matrix.csv", [
                      [
                        "资产A",
                        "资产B",
                        "相关系数",
                        "样本数",
                        "开始",
                        "结束",
                        "缺失比例",
                        "原因",
                        "频率",
                        "计价",
                        "演示",
                      ],
                      ...data.matrix
                        .flat()
                        .map((c) => [
                          c.a,
                          c.b,
                          c.value,
                          c.n,
                          c.from,
                          c.to,
                          c.missingRate,
                          c.reason,
                          frequency,
                          currency,
                          data.isDemo,
                        ]),
                    ])
                  }
                >
                  导出矩阵 CSV
                </button>
              </div>
              <div className="analytics-summary">
                <span>
                  有效资产对 <strong>{cells.length}</strong>
                </span>
                <span>
                  平均相关系数 <strong>{coefficient(mean)}</strong>
                </span>
                <span>
                  最强绝对相关{" "}
                  <strong>
                    {strongest
                      ? `${name(strongest.a)} / ${name(strongest.b)} ${coefficient(strongest.value)}`
                      : "—"}
                  </strong>
                </span>
                <span>
                  资产数量 <strong>{data.assets.length}</strong>
                </span>
                <span>
                  最高正相关{" "}
                  <strong>
                    {highest
                      ? `${name(highest.a)} / ${name(highest.b)} ${coefficient(highest.value)}`
                      : "—"}
                  </strong>
                </span>
                <span>
                  最低相关{" "}
                  <strong>
                    {lowest
                      ? `${name(lowest.a)} / ${name(lowest.b)} ${coefficient(lowest.value)}`
                      : "—"}
                  </strong>
                </span>
              </div>
              <CorrelationMatrix
                assets={data.assets}
                matrix={data.matrix}
                pair={pair}
                onPair={setPickedPair}
              />
              {!cells.length && (
                <Empty>
                  没有满足条件的非对角资产对。请检查来源、样本数量和日期区间。
                </Empty>
              )}
            </section>
          )}
        </>
      )}
      {!invalid && (
        <section className="panel analytics-pair">
          <div className="analytics-section-title">
            <h2>资产对详情</h2>
            <label>
              滚动窗口
              <select
                value={window}
                onChange={(e) => setWindow(Number(e.target.value))}
              >
                {[30, 60, 120, 252].map((w) => (
                  <option key={w} value={w}>
                    {w} 个共同观察区间
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="analytics-pair-select">
            {[0, 1].map((i) => (
              <label key={i}>
                资产{i === 0 ? " A" : " B"}
                <select
                  aria-label={i === 0 ? "资产 A" : "资产 B"}
                  value={pair[i] || ""}
                  onChange={(e) =>
                    setPickedPair(
                      i === 0
                        ? [e.target.value, pair[1]]
                        : [pair[0], e.target.value],
                    )
                  }
                >
                  {assets.map((id) => (
                    <option key={id} value={id}>
                      {name(id)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <ErrorNotice
            message={rollingRequest.error}
            retry={() => setVersion((v) => v + 1)}
          />
          {rollingRequest.loading && <Loading />}
          {rolling && (
            <>
              <p className="analytics-cell-detail">
                {cellDescription(rolling.cell)}
              </p>
              <RollingVisual
                key={`${pair.join()}-${window}-${frequency}-${currency}-${dates.from}-${dates.to}`}
                points={rolling.points}
              />
              {!compact && (
                <PairRelationship
                  key={pair.join()}
                  pairs={rolling.pairs}
                  a={name(pair[0])}
                  b={name(pair[1])}
                  aBp={
                    catalog.find((a) => a.id === pair[0])?.transform ===
                    "bp-change"
                  }
                  bBp={
                    catalog.find((a) => a.id === pair[1])?.transform ===
                    "bp-change"
                  }
                />
              )}
              <div className="analytics-export">
                <button
                  onClick={() =>
                    downloadCsv("correlation-rolling.csv", [
                      [
                        "日期",
                        "滚动相关系数",
                        "资产A",
                        "资产B",
                        "窗口",
                        "演示",
                      ],
                      ...rolling.points.map((p) => [
                        p.time,
                        p.value,
                        pair[0],
                        pair[1],
                        window,
                        rolling.isDemo,
                      ]),
                    ])
                  }
                >
                  导出滚动 CSV
                </button>
                <button
                  onClick={() =>
                    downloadCsv("correlation-pairs.csv", [
                      ["日期", pair[0], pair[1], "A变换", "B变换", "演示"],
                      ...rolling.pairs.map((p) => [
                        p.time,
                        p.x,
                        p.y,
                        catalog.find((a) => a.id === pair[0])?.transform,
                        catalog.find((a) => a.id === pair[1])?.transform,
                        rolling.isDemo,
                      ]),
                    ])
                  }
                >
                  导出配对 CSV
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <details className="panel analytics-method" open={!compact}>
        <summary>方法与数据溯源</summary>
        <p>
          价格序列使用简单收益率，指数为价格回报，不包含分红。利率使用基点变化，不可当作可投资资产收益。Pearson
          相关系数至少需要20个配对观测；零方差或样本不足保持空白。
        </p>
        <p>
          日度匹配相同起止日，周度按 ISO
          周度按ISO周、月度按自然月取期末实际观察。先按观察日精确匹配汇率，再计算收益；缺失不前向填充。跨市场同日收盘并不同步，相关性可能受时差影响。滚动窗口按共同观测区间计数，不等于日历天。
        </p>
        {data && (
          <p className="muted small">
            算法：{data.algorithm} · {data.from} 至 {data.to} · {data.frequency}{" "}
            · {data.currency}
          </p>
        )}
        {[
          ...new Set([...(data?.warnings || []), ...(rolling?.warnings || [])]),
        ].map((w) => (
          <p key={w} className="notice">
            {w}
          </p>
        ))}
        <div className="analytics-provenance">
          {(data?.assets || catalog.filter((a) => assets.includes(a.id))).map(
            (a) => (
              <article key={a.id}>
                <strong>{a.name}</strong>
                <span>
                  {statusLabel[a.status] || a.status} · {a.count} 个历史观察
                </span>
                <a href={a.source.url} target="_blank" rel="noreferrer">
                  {a.source.label}
                </a>
                <small>
                  数据截至 {a.asOf || "尚无数据"} · 采集{" "}
                  {a.fetchedAt || "尚无记录"}
                </small>
                {a.reason && <small>{a.reason}</small>}
              </article>
            ),
          )}
        </div>
      </details>
    </div>
  );
}
