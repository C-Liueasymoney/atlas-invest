"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Search, Star } from "lucide-react";
import { api, json, unitLabel, frequencyLabel, Series, useRemote } from "./api";
import {
  ActionFeedback,
  Empty,
  ErrorNotice,
  Loading,
  PageHeading,
  useAction,
} from "./ui";
import { LatestQuoteDetails } from "./market";
import { PriceChart } from "./charts";
export function CatalogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const remote = useRemote<{ items: Series[] }>(
    `/api/v1/catalog?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,
  );
  const all = useRemote<{ items: Series[] }>("/api/v1/catalog");
  const action = useAction();
  return (
    <>
      <PageHeading
        eyebrow="EXPLORE YOUR UNIVERSE"
        title="指标目录"
        description="每项指标，都有清晰的单位、频率与原始来源。"
      />
      <div className="catalog-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索指标目录"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称、代码或别名…"
          />
        </div>
        <select
          aria-label="按资产类别筛选"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">全部分类</option>
          {[...new Set(all.data?.items.map((s) => s.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="muted small">
          {remote.data?.items.length ?? "—"} 项指标
        </span>
      </div>
      <ActionFeedback action={action} />
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : !remote.data?.items.length ? (
        <Empty>没有匹配的指标，请更换关键词。</Empty>
      ) : (
        <div className="indicator-grid">
          {remote.data.items.map((s) => (
            <article className="panel indicator-card" key={s.id}>
              <div className="indicator-card-top">
                <span className="category-label">{s.category}</span>
                <button
                  className="icon-button"
                  aria-label={`收藏 ${s.nameZh}`}
                  onClick={() =>
                    action.run(() => addToWatchlist(s.id), "已加入观察列表")
                  }
                >
                  <Star size={17} />
                </button>
              </div>
              <Link href={`/indicators/${s.id}`}>
                <h2>
                  {s.nameZh} <ArrowUpRight size={16} />
                </h2>
                <code>{s.id}</code>
              </Link>
              <p>{s.description}</p>
              <div className="indicator-card-meta">
                <span>{unitLabel(s.unit)}</span>
                <span>{frequencyLabel(s.frequency)}</span>
                <span>{s.providerId}</span>
              </div>
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="small muted"
              >
                原始数据来源 <ArrowUpRight size={12} />
              </a>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export async function addToWatchlist(seriesId: string) {
  const lists = await api<{ items: { id: string }[] }>("/api/v1/watchlists");
  let id = lists.items[0]?.id;
  if (!id) {
    const list = await api<{ id: string }>(
      "/api/v1/watchlists",
      json("POST", { name: "我的观察列表" }),
    );
    id = list.id;
  }
  await api(`/api/v1/watchlists/${id}/items`, json("POST", { seriesId }));
}
export function IndicatorDetail({ id }: { id: string }) {
  const remote = useRemote<Series>(
    `/api/v1/series/${encodeURIComponent(id)}/metadata`,
  );
  const action = useAction();
  const s = remote.data;
  return (
    <>
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : (
        s && (
          <>
            <PageHeading
              eyebrow={`${s.category} / ${s.providerSymbol}`}
              title={s.nameZh}
              description={s.description}
              actions={
                <>
                  <button
                    onClick={() =>
                      action.run(() => addToWatchlist(id), "已加入观察列表")
                    }
                    disabled={action.busy}
                  >
                    <Star size={15} />
                    加入观察列表
                  </button>
                  <a
                    className="button"
                    href={`/api/v1/export?seriesId=${encodeURIComponent(id)}&format=csv`}
                  >
                    <ArrowDownToLine size={15} />
                    导出 CSV
                  </a>
                </>
              }
            />
            <ActionFeedback action={action} />
            <LatestQuoteDetails seriesId={id} />
            <section className="panel detail-chart">
              <div className="panel-heading">
                <h2>历史走势</h2>
                <span className="muted small">
                  {unitLabel(s.unit)} · {frequencyLabel(s.frequency)}
                </span>
              </div>
              <PriceChart seriesId={id} range="3Y" />
            </section>
            <section className="panel metadata-panel">
              <h2>数据口径与研究说明</h2>
              <dl>
                <div>
                  <dt>标准代码</dt>
                  <dd>{s.id}</dd>
                </div>
                <div>
                  <dt>供应商映射</dt>
                  <dd>
                    {s.providerId} / {s.providerSymbol}
                  </dd>
                </div>
                <div>
                  <dt>频率 / 单位</dt>
                  <dd>
                    {s.frequency} / {s.unit}
                  </dd>
                </div>
                <div>
                  <dt>原始来源时区</dt>
                  <dd>{s.timezone}</dd>
                </div>
                <div>
                  <dt>陈旧阈值</dt>
                  <dd>{s.staleSeconds.toLocaleString()} 秒</dd>
                </div>
              </dl>
              <p>{s.description}</p>
              <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                查看原始来源 <ArrowUpRight size={13} />
              </a>
            </section>
          </>
        )
      )}
    </>
  );
}
