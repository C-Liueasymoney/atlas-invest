"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Search, Star } from "lucide-react";
import { unitLabel, frequencyLabel, Quote, Series, useRemote } from "./api";
import { ActionFeedback, Empty, ErrorNotice, Loading, PageHeading } from "./ui";
import { ImportHistory } from "./provenance";
import { RiskPanel } from "./risk";
import { MarketHero } from "./market-focus";
import { PriceChart } from "./charts";
import { useFavorites } from "./use-favorites";
export function CatalogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const remote = useRemote<{ items: Series[] }>(
    `/api/v1/catalog?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,
  );
  const all = useRemote<{ items: Series[] }>("/api/v1/catalog");
  const favorites = useFavorites();
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
      <ActionFeedback action={favorites.action} />
      <ErrorNotice message={favorites.error} retry={favorites.refresh} />
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
                  aria-label={`${favorites.has(s.id) ? "取消收藏" : "收藏"} ${s.nameZh}`}
                  aria-pressed={favorites.has(s.id)}
                  disabled={favorites.disabled}
                  onClick={() => favorites.toggle(s.id)}
                >
                  <Star
                    size={17}
                    className={
                      favorites.has(s.id) ? "favorite-star" : undefined
                    }
                  />
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
export function IndicatorDetail({ id }: { id: string }) {
  const remote = useRemote<Series>(
    `/api/v1/series/${encodeURIComponent(id)}/metadata`,
  );
  const latest = useRemote<{ items: Quote[] }>(
    `/api/v1/quotes?seriesIds=${encodeURIComponent(id)}`,
  );
  const favorites = useFavorites();
  const s = remote.data;
  return (
    <>
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : (
        s && (
          <>
            <div className="market-breadcrumb">
              <Link href="/indicators">指标目录</Link>
              <span>›</span>
              <span>{s.providerSymbol}</span>
            </div>
            <MarketHero
              series={s}
              quote={latest.data?.items.find((q) => q.seriesId === id)}
              actions={
                <>
                  <button
                    onClick={() => favorites.toggle(id)}
                    disabled={favorites.disabled}
                    aria-pressed={favorites.has(id)}
                  >
                    <Star
                      size={15}
                      className={
                        favorites.has(id) ? "favorite-star" : undefined
                      }
                    />
                    {favorites.has(id) ? "取消自选" : "加入自选"}
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
            <ActionFeedback action={favorites.action} />
            <ErrorNotice message={favorites.error} retry={favorites.refresh} />
            <ErrorNotice message={latest.error} retry={latest.refresh} />
            <div className="focus-tabs detail-tabs">
              <a href="#price-chart">图表</a>
              <a href="#series-metadata">数据说明</a>
              <Link href="/workspace">
                比较分析 <ArrowUpRight size={13} />
              </Link>
            </div>
            <section id="price-chart" className="panel detail-chart">
              <div className="panel-heading">
                <h2>历史走势</h2>
                <span className="muted small">
                  {unitLabel(s.unit)} · {frequencyLabel(s.frequency)}
                </span>
              </div>
              <PriceChart seriesId={id} range="3Y" />
            </section>
            {s.kind === "imported" && <ImportHistory seriesId={s.id} />}
            {(s.kind === "ohlc" || s.id === "FX_USDCNY_D1") && (
              <RiskPanel seriesId={s.id} />
            )}
            <section id="series-metadata" className="panel metadata-panel">
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
