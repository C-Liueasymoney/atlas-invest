"use client";
import { useEffect, useRef, useState } from "react";
import { api, json, useRemote } from "./api";
import { ErrorNotice, Loading, ActionFeedback, useAction } from "./ui";
import {
  portfolioAssets,
  shockPresets,
  type PortfolioInput,
  type SavedPortfolio,
  type ScenarioResult,
} from "@/lib/analytics/portfolio";
import "./analytics-portfolio.css";

const example: PortfolioInput = {
  name: "示例组合（可修改）",
  baseCurrency: "CNY",
  mode: "percent",
  initialValue: 100000,
  positions: [
    { assetId: "FRED_NASDAQ100", value: 25, exposureCurrency: "USD" },
    { assetId: "SGE_AU9999_D1", value: 10, exposureCurrency: "CNY" },
    { assetId: "CASH_CNY", value: 65, exposureCurrency: "CNY" },
  ],
  thresholds: [20],
  highVolatilityTargetPct: 25,
  highVolatilityLimitPct: 30,
};
const defaultShocks: Record<string, number> = {
  FRED_NASDAQ100: -40,
  SGE_AU9999_D1: -10,
};
const pct = (n: number) => `${n.toFixed(2)}%`;
const money = (n: number) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
export function PortfolioAnalytics({
  compact = false,
  initialPortfolioId,
  initialShocks,
  initialFxShockPct,
  onConfig,
}: {
  compact?: boolean;
  initialPortfolioId?: string;
  initialShocks?: Record<string, number>;
  initialFxShockPct?: number;
  onConfig?: (config: {
    portfolioId: string;
    shocks?: Record<string, number>;
    fxShockPct?: number;
  }) => void;
}) {
  const remote = useRemote<{ items: SavedPortfolio[] }>(
    "/api/v1/analytics/portfolios",
  );
  const [selected, setSelected] = useState(initialPortfolioId || "");
  const [loadedPortfolioId, setLoadedPortfolioId] = useState("");
  const [draft, setDraft] = useState<PortfolioInput>(example);
  const [shocks, setShocks] = useState<Record<string, number>>(() => ({
    ...(initialShocks ?? defaultShocks),
  }));
  const [fx, setFx] = useState(() => String(initialFxShockPct ?? 0));
  const [result, setResult] = useState<ScenarioResult>();
  const [loadError, setLoadError] = useState("");
  const revision = useRef(0);
  const selectionGeneration = useRef(0);
  const configCallback = useRef(onConfig);
  const lastEmittedConfig = useRef("");
  const action = useAction();
  const settingsKey = JSON.stringify({
    portfolioId: selected,
    shocks,
    fxShockPct: fx.trim() === "" ? null : Number(fx),
  });
  useEffect(() => {
    configCallback.current = onConfig;
  }, [onConfig]);
  useEffect(() => {
    const settings = JSON.parse(settingsKey) as {
      portfolioId: string;
      shocks: Record<string, number>;
      fxShockPct: number | null;
    };
    if (
      !configCallback.current ||
      settings.fxShockPct === null ||
      !Number.isFinite(settings.fxShockPct) ||
      settings.fxShockPct <= -100 ||
      settings.fxShockPct > 1000 ||
      !Object.values(settings.shocks).every(
        (n) => Number.isFinite(n) && n >= -100 && n <= 1000,
      ) ||
      lastEmittedConfig.current === settingsKey
    )
      return;
    lastEmittedConfig.current = settingsKey;
    configCallback.current({ ...settings, fxShockPct: settings.fxShockPct });
  }, [settingsKey]);
  useEffect(() => {
    const id = initialPortfolioId;
    revision.current++;
    const generation = ++selectionGeneration.current;
    if (!id) return;
    let live = true;
    api<{ item: SavedPortfolio }>(
      `/api/v1/analytics/portfolios/${encodeURIComponent(id)}`,
    )
      .then((d) => {
        if (live && selectionGeneration.current === generation) {
          revision.current++;
          setSelected(id);
          setDraft(d.item);
          setLoadedPortfolioId(id);
          setResult(undefined);
        }
      })
      .catch((e) => {
        if (live && selectionGeneration.current === generation)
          setLoadError(e instanceof Error ? e.message : "读取组合失败");
      });
    return () => {
      live = false;
    };
  }, [initialPortfolioId]);
  function invalidateResult() {
    revision.current++;
    setResult(undefined);
  }
  function edit(update: Partial<PortfolioInput>) {
    invalidateResult();
    setDraft((p) => ({ ...p, ...update }));
  }
  async function calculate() {
    if (!draftReady) return;
    const version = revision.current;
    await action.run(async () => {
      const d = await api<ScenarioResult>(
        "/api/v1/analytics/portfolio/scenario",
        json("POST", {
          portfolio: draft,
          shocks,
          ...(fx.trim() !== "" ? { fxShockPct: Number(fx) } : {}),
        }),
      );
      if (revision.current === version) setResult(d);
    }, "已计算假设情景");
  }
  async function save() {
    if (!draftReady) return;
    const version = revision.current;
    await action.run(async () => {
      const d = await api<{ item: SavedPortfolio }>(
        "/api/v1/analytics/portfolios" + (selected ? "/" + selected : ""),
        json(selected ? "PUT" : "POST", draft),
      );
      if (revision.current === version) {
        selectionGeneration.current++;
        setSelected(d.item.id);
        setDraft(d.item);
        setLoadedPortfolioId(d.item.id);
        onConfig?.({ portfolioId: d.item.id });
      }
      remote.refresh();
    }, "组合已保存");
  }
  function select(id: string) {
    selectionGeneration.current++;
    invalidateResult();
    setLoadError("");
    setSelected(id);
    if (!id) {
      setDraft(example);
      setLoadedPortfolioId("");
      onConfig?.({ portfolioId: "" });
      return;
    }
    const saved = remote.data?.items.find((x) => x.id === id);
    if (saved) {
      setDraft(saved);
      setLoadedPortfolioId(id);
    } else setLoadedPortfolioId("");
    onConfig?.({ portfolioId: id });
  }
  const total = draft.positions.reduce((s, p) => s + p.value, 0);
  const draftReady = loadedPortfolioId === selected;
  const validTotal =
    draft.mode === "amount" ? total > 0 : Math.abs(total - 100) < 1e-6;
  return (
    <section
      className={`portfolio-analytics ${compact ? "portfolio-compact" : ""}`}
      aria-label="组合风险情景"
    >
      <header className="portfolio-header">
        <div>
          <h2>组合风险情景</h2>
          <p>手动假设冲击 · 价格收益与显式货币敞口</p>
        </div>
        <span className="badge">假设情景，非预测</span>
      </header>
      <ErrorNotice message={remote.error} />
      <ErrorNotice message={loadError} />
      <ActionFeedback action={action} />
      {!draftReady && !loadError && (
        <p role="status">正在读取所选组合，载入完成后可计算。</p>
      )}
      {remote.loading && !remote.data ? (
        <Loading />
      ) : (
        <div className="portfolio-controls">
          <label>
            已保存组合
            <select
              aria-label="已保存组合"
              value={selected}
              onChange={(e) => select(e.target.value)}
            >
              <option value="">新建 / 可编辑示例</option>
              {remote.data?.items.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <button
                type="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    const version = revision.current;
                    const d = await api<{ item: SavedPortfolio }>(
                      `/api/v1/analytics/portfolios/${selected}/copy`,
                      json("POST", {}),
                    );
                    if (revision.current === version) {
                      selectionGeneration.current++;
                      invalidateResult();
                      setSelected(d.item.id);
                      setDraft(d.item);
                      setLoadedPortfolioId(d.item.id);
                      onConfig?.({ portfolioId: d.item.id });
                    }
                    remote.refresh();
                  }, "已复制组合")
                }
              >
                复制
              </button>
              <button
                type="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    const version = revision.current;
                    await api(
                      `/api/v1/analytics/portfolios/${selected}`,
                      json("DELETE"),
                    );
                    if (revision.current === version) {
                      select("");
                      onConfig?.({ portfolioId: "" });
                    }
                    remote.refresh();
                  }, "组合已删除")
                }
              >
                删除
              </button>
            </>
          )}
        </div>
      )}
      {compact && !initialPortfolioId && (
        <p className="notice">选择已保存组合后，将固定此组件的组合引用。</p>
      )}
      {!compact && (
        <fieldset disabled={!draftReady} className="portfolio-editor">
          <div className="portfolio-controls">
            <label>
              名称（编辑可改名）
              <input
                aria-label="组合名称"
                value={draft.name}
                maxLength={80}
                onChange={(e) => edit({ name: e.target.value })}
              />
            </label>
            <label>
              基准币种
              <select
                value={draft.baseCurrency}
                onChange={(e) =>
                  edit({ baseCurrency: e.target.value as "CNY" | "USD" })
                }
              >
                <option>CNY</option>
                <option>USD</option>
              </select>
            </label>
            <label>
              录入方式
              <select
                value={draft.mode}
                onChange={(e) =>
                  edit({ mode: e.target.value as "percent" | "amount" })
                }
              >
                <option value="percent">权重百分比</option>
                <option value="amount">基准币金额</option>
              </select>
            </label>
            {draft.mode === "percent" && (
              <label>
                组合初始价值（{draft.baseCurrency}）
                <input
                  aria-label="组合初始价值"
                  type="number"
                  min="0.01"
                  max="1000000000000000"
                  step="any"
                  value={draft.initialValue ?? 100000}
                  onChange={(e) =>
                    edit({ initialValue: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
          <p className="portfolio-help">
            金额模式填写已换算为 {draft.baseCurrency}{" "}
            的市值；切换方式会保留数值，请重新核对。未投资余额必须显式添加现金。USD报价资产若收益已换算成人民币，请选CNY敞口，避免重复计算汇率。
          </p>
          <div className="portfolio-scroll">
            <table>
              <thead>
                <tr>
                  <th>资产</th>
                  <th>
                    {draft.mode === "percent"
                      ? "权重 %"
                      : `金额 ${draft.baseCurrency}`}
                  </th>
                  <th>冲击对应货币敞口</th>
                  <th>假设涨跌 %</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {draft.positions.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        aria-label={`资产 ${i + 1}`}
                        value={p.assetId}
                        onChange={(e) => {
                          const asset = portfolioAssets.find(
                            (a) => a.id === e.target.value,
                          )!;
                          edit({
                            positions: draft.positions.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    assetId: asset.id,
                                    exposureCurrency: asset.currency,
                                  }
                                : x,
                            ),
                          });
                        }}
                      >
                        {portfolioAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`持仓 ${i + 1}`}
                        type="number"
                        min="0"
                        step="any"
                        value={p.value}
                        onChange={(e) =>
                          edit({
                            positions: draft.positions.map((x, j) =>
                              j === i
                                ? { ...x, value: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`货币敞口 ${i + 1}`}
                        disabled={p.assetId.startsWith("CASH_")}
                        value={p.exposureCurrency}
                        onChange={(e) =>
                          edit({
                            positions: draft.positions.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    exposureCurrency: e.target.value as
                                      "CNY" | "USD",
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option>CNY</option>
                        <option>USD</option>
                      </select>
                    </td>
                    <td>
                      {p.assetId.startsWith("CASH_") ? (
                        "0（本币）"
                      ) : (
                        <input
                          aria-label={`假设涨跌 ${i + 1}`}
                          type="number"
                          min="-100"
                          max="1000"
                          step="any"
                          value={shocks[p.assetId] ?? 0}
                          onChange={(e) => {
                            setShocks({
                              ...shocks,
                              [p.assetId]: Number(e.target.value),
                            });
                            invalidateResult();
                          }}
                        />
                      )}
                    </td>
                    <td>
                      <button
                        aria-label={`移除持仓 ${i + 1}`}
                        onClick={() =>
                          edit({
                            positions: draft.positions.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="portfolio-controls">
            <button
              disabled={draft.positions.length >= portfolioAssets.length}
              onClick={() => {
                const asset = portfolioAssets.find(
                  (a) => !draft.positions.some((p) => p.assetId === a.id),
                );
                if (asset)
                  edit({
                    positions: [
                      ...draft.positions,
                      {
                        assetId: asset.id,
                        value: 0,
                        exposureCurrency: asset.currency,
                      },
                    ],
                  });
              }}
            >
              添加资产 / 现金
            </button>
            <button onClick={() => edit({ positions: [] })}>清空持仓</button>
            <span role="status">
              合计 {total.toLocaleString()}{" "}
              {draft.mode === "percent" ? "%" : draft.baseCurrency}
            </span>
            {!validTotal && (
              <span className="portfolio-alert">
                {draft.mode === "percent"
                  ? "权重必须合计100%"
                  : "总金额须大于零"}
              </span>
            )}
          </div>
          <p className="portfolio-help">
            尚无已接入的债券价格资产。利率/实际利率、美元指数、CPI及其他宏观指标不可作为持仓。示例：25%纳指×-40%
            + 10%黄金×-10% + 20%债券×-5% + 45%现金×0% =
            -12%；债券部分仅为手算假设，不可保存为虚构ETF。
          </p>
        </fieldset>
      )}
      <div className="portfolio-controls">
        <label>
          假设情景预设
          <select
            aria-label="假设情景预设"
            defaultValue=""
            onChange={(e) => {
              const preset = shockPresets.find((p) => p.id === e.target.value);
              if (preset) {
                setShocks({ ...preset.shocks });
                setFx(String(preset.fxShockPct));
                invalidateResult();
              }
            }}
          >
            <option value="">自定义冲击</option>
            {shockPresets.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          USD/CNY 假设变化 %
          <input
            aria-label="USD/CNY假设变化"
            type="number"
            min="-99.999"
            max="1000"
            step="any"
            value={fx}
            onChange={(e) => {
              setFx(e.target.value);
              invalidateResult();
            }}
          />
        </label>
      </div>
      {!compact && (
        <fieldset
          disabled={!draftReady}
          className="portfolio-controls portfolio-editor"
        >
          <label>
            亏损提示阈值 %
            <input
              aria-label="亏损提示阈值"
              type="number"
              min="0.01"
              max="100"
              value={draft.thresholds[0]}
              onChange={(e) => edit({ thresholds: [Number(e.target.value)] })}
            />
          </label>
          <label>
            高波动目标仓位 %
            <input
              type="number"
              min="0"
              max="100"
              value={draft.highVolatilityTargetPct ?? 25}
              onChange={(e) =>
                edit({ highVolatilityTargetPct: Number(e.target.value) })
              }
            />
          </label>
          <label>
            高波动仓位提示阈值 %
            <input
              type="number"
              min="0"
              max="100"
              value={draft.highVolatilityLimitPct ?? 30}
              onChange={(e) =>
                edit({ highVolatilityLimitPct: Number(e.target.value) })
              }
            />
          </label>
        </fieldset>
      )}
      <div className="portfolio-controls">
        <button
          className="primary"
          disabled={
            action.busy ||
            !validTotal ||
            !draftReady ||
            !!loadError ||
            (compact &&
              (!selected || !remote.data?.items.some((p) => p.id === selected)))
          }
          onClick={calculate}
        >
          计算假设结果
        </button>
        {!compact && (
          <button
            disabled={action.busy || !validTotal || !draftReady}
            onClick={save}
          >
            {selected ? "保存 / 改名" : "保存新组合"}
          </button>
        )}
      </div>
      {result && (
        <div className="portfolio-result">
          <strong>组合假设收益 {pct(result.returnPct)}</strong>
          <p data-testid="portfolio-before">
            冲击前价值 {money(result.beforeAmount)} {result.baseCurrency}
          </p>
          <p data-testid="portfolio-after">
            冲击后价值 {money(result.afterAmount)} {result.baseCurrency}
          </p>
          <p data-testid="portfolio-profit-loss">
            假设损益 {money(result.profitLoss)} {result.baseCurrency}；亏损金额{" "}
            {money(result.totalLoss)} {result.baseCurrency}
          </p>
          <div className="portfolio-controls">
            {result.thresholds.map((t) => (
              <span
                key={t.lossPct}
                className={t.breached ? "portfolio-alert" : ""}
              >
                亏损 {t.lossPct}% 阈值：{t.breached ? "已触发" : "未触发"}
              </span>
            ))}
          </div>
          <p
            className={
              result.highVolatility.breached
                ? "portfolio-alert"
                : "portfolio-help"
            }
          >
            高波动仓位（纳指100 + 标普500）
            {pct(result.highVolatility.weightPct)}；目标{" "}
            {result.highVolatility.targetPct}%，提示阈值{" "}
            {result.highVolatility.limitPct}%
            {result.highVolatility.breached ? " · 已超过阈值" : ""}
            。这是手动仓位分类，不是实测波动率。
          </p>
          <div className="portfolio-scroll">
            <table>
              <thead>
                <tr>
                  <th>资产</th>
                  <th>权重</th>
                  <th>含汇率收益</th>
                  <th>组合贡献（百分点）</th>
                  <th>冲击前金额</th>
                  <th>冲击后金额</th>
                  <th>假设损益（{result.baseCurrency}）</th>
                  <th>净亏损贡献占比</th>
                </tr>
              </thead>
              <tbody>
                {result.contributions.map((c) => (
                  <tr key={c.assetId}>
                    <td>{c.name}</td>
                    <td>{pct(c.weightPct)}</td>
                    <td>{pct(c.returnPct)}</td>
                    <td>{c.contributionPct.toFixed(2)}</td>
                    <td>{money(c.beforeAmount)}</td>
                    <td>{money(c.afterAmount)}</td>
                    <td>{money(c.profitLoss)}</td>
                    <td>
                      {c.lossContributionRatio === null
                        ? "—"
                        : pct(c.lossContributionRatio * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="portfolio-help">
            净亏损贡献占比 = 单项亏损 /
            组合净亏损；负值表示收益抵消亏损，单项可超过100%。组合未亏损时不计算占比。
          </p>
          {!compact &&
            result.warnings.map((w) => (
              <p className="portfolio-help" key={w}>
                {w}
              </p>
            ))}
        </div>
      )}
      {!compact && (
        <p className="portfolio-help">
          历史波动率、最大回撤、历史VaR暂不可用；后续须使用完整共同日期的真实收益序列，不能以情景结果冒充历史风险。
        </p>
      )}
    </section>
  );
}
