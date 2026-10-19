"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import GridLayout from "react-grid-layout/legacy";
import {
  ArrowUpRight,
  Check,
  GripVertical,
  LayoutGrid,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { api, json, Quote, Series, useRemote } from "./api";
import {
  createWidget,
  validateWidget,
  Widget,
  widgetRegistry,
  WidgetType,
} from "@/lib/widgets/registry";
import {
  ActionFeedback,
  Empty,
  ErrorNotice,
  Loading,
  Modal,
  useAction,
} from "./ui";
import { IndicatorTable, MetricWidget, SourceHealth } from "./market";
import { PriceChart } from "./charts";
import { CompareChart } from "./compare";
import {
  isDashboardFocusSeries,
  MarketHero,
  RelatedMarkets,
} from "./market-focus";
type Dashboard = {
  id: string;
  name: string;
  layoutVersion: number;
  widgets: Widget[];
};
export const defaultWidgets: Widget[] = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    type: "price-chart",
    title: "国内黄金 · Au99.99",
    config: { seriesId: "SGE_AU9999_D1", range: "1Y", chartType: "line" },
    layout: { x: 0, y: 0, w: 8, h: 7 },
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    type: "indicator-table",
    title: "宏观因子观察",
    config: { seriesIds: ["FRED_DFII10", "FRED_DGS10", "FX_USDCNY_D1"] },
    layout: { x: 8, y: 0, w: 4, h: 7 },
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    type: "price-chart",
    title: "美国 10 年期实际利率",
    config: { seriesId: "FRED_DFII10", range: "1Y", chartType: "line" },
    layout: { x: 0, y: 7, w: 6, h: 6 },
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    type: "price-chart",
    title: "美元 / 人民币 · 日度参考汇率",
    config: { seriesId: "FX_USDCNY_D1", range: "1Y", chartType: "line" },
    layout: { x: 6, y: 7, w: 6, h: 6 },
  },
];
export function DashboardPage() {
  const remote = useRemote<{ items: Dashboard[] }>("/api/v1/dashboards");
  const catalog = useRemote<{ items: Series[] }>("/api/v1/catalog");
  const series = [
    "SGE_AU9999_D1",
    "XAUUSD_QUOTE",
    "FX_USDCNY_D1",
    "FRED_DFII10",
    "FRED_DGS10",
    "FRED_DTWEXBGS",
    "FRED_NASDAQ100",
    "FRED_SP500",
  ]
    .map((id) => catalog.data?.items.find((s) => s.id === id))
    .filter((s): s is Series => !!s);
  const quotes = useRemote<{ items: Quote[] }>(
    series.length
      ? `/api/v1/quotes?seriesIds=${series.map((s) => s.id).join(",")}`
      : null,
  );
  const dashboard = remote.data?.items[0];
  const session = useRemote<{ mode: "preview" | "live" | "demo" }>(
    "/api/v1/session",
  );
  const [focus, setFocus] = useState("SGE_AU9999_D1");
  const [view, setView] = useState<"overview" | "research">("overview");
  const refreshAction = useAction();
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const focusSeries = catalog.data?.items.find((s) => s.id === focus);
  const focusQuote = useRemote<{ items: Quote[] }>(
    `/api/v1/quotes?seriesIds=${focus}`,
  );
  const [draft, setDraft] = useState<Widget[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [widgetType, setWidgetType] = useState<WidgetType>("price-chart");
  const [selectedSeries, setSelectedSeries] = useState("SGE_AU9999_D1");
  const [selectedIds, setSelectedIds] = useState([
    "SGE_AU9999_D1",
    "FRED_DFII10",
  ]);
  const [width, setWidth] = useState(1000);
  const container = useRef<HTMLDivElement>(null);
  const action = useAction();
  const widgets = draft ?? dashboard?.widgets ?? defaultWidgets;
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [view]);
  function updateConfig(id: string, patch: Widget["config"]) {
    setDraft(
      widgets.map((w) =>
        w.id === id ? { ...w, config: { ...w.config, ...patch } } : w,
      ),
    );
  }
  async function save() {
    await action.run(async () => {
      let id = dashboard?.id;
      if (!id) {
        const created = await api<Dashboard>(
          "/api/v1/dashboards",
          json("POST", { name: "黄金研究" }),
        );
        id = created.id;
      }
      await api(`/api/v1/dashboards/${id}/widgets`, json("PUT", { widgets }));
      remote.refresh();
      setDraft(null);
      setEditing(false);
    }, "看板布局已保存");
  }
  return (
    <>
      <div className="market-breadcrumb">
        <Link href="/indicators">市场</Link>
        <span>›</span>
        <span>黄金、指数与宏观</span>
        <select
          aria-label="选择主图指标"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        >
          {catalog.data?.items.filter(isDashboardFocusSeries).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameZh}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice
        message={catalog.error || focusQuote.error}
        retry={() => {
          catalog.refresh();
          focusQuote.refresh();
        }}
      />
      <MarketHero
        series={focusSeries}
        quote={focusQuote.data?.items.find((q) => q.seriesId === focus)}
        actions={
          <>
            {session.data && session.data.mode !== "demo" && (
              <button
                disabled={refreshAction.busy || !focusSeries}
                onClick={() =>
                  refreshAction.run(async () => {
                    const result = await api<{ message?: string }>(
                      session.data?.mode === "preview"
                        ? "/api/v1/market/refresh"
                        : `/api/providers/${focusSeries?.providerId}/sync`,
                      json(
                        "POST",
                        session.data?.mode === "preview"
                          ? {}
                          : { seriesId: focus },
                      ),
                    );
                    focusQuote.refresh();
                    quotes.refresh();
                    setRefreshVersion((v) => v + 1);
                    setRefreshMessage(
                      result.message || "采集完成，以来源公布日期为准",
                    );
                    return result;
                  }, "")
                }
              >
                {refreshAction.busy ? "正在采集…" : "刷新数据"}
              </button>
            )}
            <Link className="button subtle" href={`/indicators/${focus}`}>
              指标详情 <ArrowUpRight size={14} />
            </Link>
          </>
        }
      />
      <ActionFeedback action={refreshAction} />
      {refreshMessage && (
        <p role="status" className="refresh-result">
          {refreshMessage}
        </p>
      )}
      <div className="focus-tabs" role="tablist" aria-label="行情内容">
        <button
          role="tab"
          aria-selected={view === "overview"}
          className={view === "overview" ? "active" : ""}
          onClick={() => setView("overview")}
        >
          总览
        </button>
        <button
          role="tab"
          aria-selected={view === "research"}
          className={view === "research" ? "active" : ""}
          onClick={() => setView("research")}
        >
          研究看板<span>{widgets.length}</span>
        </button>
        <Link href="/workspace">
          比较分析 <ArrowUpRight size={13} />
        </Link>
      </div>
      {view === "overview" ? (
        <div className="focus-market-layout">
          <section className="focus-chart-section" aria-label="主要价格图表">
            <PriceChart
              key={`${focus}-${refreshVersion}`}
              seriesId={focus}
              range="1Y"
              chartType="line"
            />
          </section>
          <RelatedMarkets
            series={series.filter((s) => s.id !== focus)}
            quotes={quotes.data?.items || []}
          />
        </div>
      ) : (
        <>
          <div className="research-layout-heading">
            <div>
              <h2>黄金研究看板</h2>
              <p>保留你的图表、指标与布局。</p>
            </div>
            <div className="actions">
              <button
                className={editing ? "selected" : ""}
                onClick={() => setEditing(!editing)}
              >
                <Settings2 size={15} />
                {editing ? "完成编辑" : "编辑布局"}
              </button>
              <button className="primary" onClick={() => setAdding(true)}>
                <Plus size={16} />
                添加组件
              </button>
            </div>
          </div>
          <ErrorNotice
            message={remote.error || quotes.error}
            retry={() => {
              remote.refresh();
              quotes.refresh();
            }}
          />
          <ActionFeedback action={action} />
          <div className="section-toolbar dashboard-toolbar">
            <div className="tabs">
              <button className="active">
                <LayoutGrid size={14} />
                黄金研究 <span>{widgets.length} 个组件</span>
              </button>
            </div>
            <div className="actions">
              {draft && <span className="unsaved">有未保存修改</span>}
              <button
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "恢复黄金研究默认布局？保存后将替换当前布局。",
                    )
                  )
                    setDraft(defaultWidgets);
                }}
              >
                <RotateCcw size={13} />
                恢复默认
              </button>
              <button disabled={action.busy} onClick={save}>
                <Check size={14} />
                保存布局
              </button>
            </div>
          </div>
          {editing && (
            <p className="notice">
              拖动组件标题调整位置，拖动右下角调整大小。移动端按单列展示，保留桌面布局。
            </p>
          )}
          <div ref={container} className="dashboard-grid-container">
            {remote.loading ? (
              <Loading />
            ) : widgets.length === 0 ? (
              <Empty>
                看板还是空的。添加图表、行情卡或数据源组件开始研究。
              </Empty>
            ) : (
              <GridLayout
                width={width}
                cols={width < 680 ? 1 : 12}
                rowHeight={52}
                margin={[16, 16]}
                containerPadding={[0, 0]}
                isDraggable={editing && width >= 680}
                isResizable={editing && width >= 680}
                draggableHandle=".widget-header"
                layout={widgets.map((w, i) => ({
                  i: w.id,
                  ...w.layout,
                  ...(width < 680
                    ? {
                        x: 0,
                        y: i * 7,
                        w: 1,
                        h: w.type === "metric-card" ? 4 : 7,
                      }
                    : { minW: 3, minH: 4 }),
                }))}
                onLayoutChange={(layout) => {
                  if (!editing || width < 680) return;
                  const next = widgets.map((w) => {
                    const l = layout.find((l) => l.i === w.id);
                    return l
                      ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
                      : w;
                  });
                  if (JSON.stringify(next) !== JSON.stringify(widgets))
                    setDraft(next);
                }}
              >
                {widgets.map((w) => (
                  <section
                    key={w.id}
                    className={`panel widget ${editing ? "widget-editing" : ""}`}
                  >
                    <header className="widget-header">
                      <h2>
                        {editing && <GripVertical size={15} />}{" "}
                        {w.title ||
                          (w.config.seriesId
                            ? catalog.data?.items.find(
                                (s) => s.id === w.config.seriesId,
                              )?.nameZh
                            : undefined) ||
                          widgetRegistry[w.type as WidgetType]?.title ||
                          w.type}
                      </h2>
                      <div>
                        {w.config.seriesId && (
                          <Link
                            href={`/indicators/${w.config.seriesId}`}
                            aria-label="查看指标详情"
                          >
                            <ArrowUpRight size={15} />
                          </Link>
                        )}
                        {editing && (
                          <button
                            className="icon-button danger"
                            aria-label={`删除组件 ${w.title || w.type}`}
                            onClick={() =>
                              setDraft(
                                widgets.filter((item) => item.id !== w.id),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </header>
                    <div className="widget-body">
                      {validateWidget(w) ? (
                        <WidgetContent
                          widget={w}
                          onConfig={(patch) => updateConfig(w.id, patch)}
                        />
                      ) : (
                        <Empty>
                          组件配置无法识别。请删除后从组件目录重新添加。
                        </Empty>
                      )}
                    </div>
                  </section>
                ))}
              </GridLayout>
            )}
          </div>
        </>
      )}
      <p className="market-disclaimer">
        数据仅供个人研究，不构成投资建议。价格、频率与公布日期以原始来源为准。
      </p>
      {adding && (
        <Modal title="添加研究组件" onClose={() => setAdding(false)}>
          <div className="widget-catalog">
            {Object.entries(widgetRegistry).map(([type, definition]) => (
              <button
                key={type}
                className={type === widgetType ? "selected" : ""}
                onClick={() => setWidgetType(type as WidgetType)}
              >
                <strong>{definition.title}</strong>
                <span>{definition.description}</span>
              </button>
            ))}
          </div>
          {widgetType !== "source-health" && (
            <label>
              选择指标
              {widgetType === "compare-chart" ||
              widgetType === "indicator-table" ? (
                <div className="multi-select">
                  {catalog.data?.items.map((s) => (
                    <label className="checkbox" key={s.id}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked
                              ? [...selectedIds, s.id]
                              : selectedIds.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.nameZh}
                    </label>
                  ))}
                </div>
              ) : (
                <select
                  value={selectedSeries}
                  onChange={(e) => setSelectedSeries(e.target.value)}
                >
                  {catalog.data?.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameZh} · {s.unit}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
          <button
            className="primary"
            disabled={
              (widgetType === "compare-chart" && selectedIds.length < 2) ||
              (widgetType === "indicator-table" && !selectedIds.length)
            }
            onClick={() => {
              const config = {
                ...widgetRegistry[widgetType].defaultConfig,
                ...(widgetType === "compare-chart" ||
                widgetType === "indicator-table"
                  ? { seriesIds: selectedIds }
                  : widgetType === "source-health"
                    ? {}
                    : { seriesId: selectedSeries }),
              };
              const widget = createWidget(widgetType, config, widgets.length);
              setDraft([...widgets, widget]);
              setAdding(false);
            }}
          >
            添加到看板
          </button>
          <p className="small muted">
            添加后点击「保存布局」，即可在下次打开时恢复。
          </p>
        </Modal>
      )}
    </>
  );
}
function WidgetContent({
  widget: w,
  onConfig,
}: {
  widget: Widget;
  onConfig: (patch: Widget["config"]) => void;
}) {
  switch (w.type) {
    case "price-chart":
      return (
        <PriceChart
          seriesId={w.config.seriesId!}
          chartType={w.config.chartType}
          range={w.config.range}
          onConfig={onConfig}
        />
      );
    case "metric-card":
      return <MetricWidget seriesId={w.config.seriesId!} />;
    case "indicator-table":
      return <IndicatorTable ids={w.config.seriesIds!} />;
    case "source-health":
      return <SourceHealth />;
    case "compare-chart":
      return (
        <CompareChart
          ids={w.config.seriesIds!}
          mode={w.config.scaleMode || "index100"}
        />
      );
    default:
      return <Empty>此组件类型尚未注册</Empty>;
  }
}
