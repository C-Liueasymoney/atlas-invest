"use client";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Database } from "lucide-react";
import {
  formatValue,
  dateTime,
  unitLabel,
  Quote,
  Series,
  useRemote,
} from "./api";
import { Badge, Empty, ErrorNotice, Loading } from "./ui";
export function QuoteCard({
  series,
  quote,
}: {
  series: Series;
  quote?: Quote;
}) {
  const difference =
    quote?.value != null && quote.previousValue != null
      ? Number(quote.value) - Number(quote.previousValue)
      : null;
  const pct =
    difference !== null && Number(quote?.previousValue) !== 0
      ? (difference / Number(quote?.previousValue)) * 100
      : null;
  const rate =
    series.unit === "%" ||
    series.unit === "percent" ||
    series.unit.includes("百分点");
  return (
    <Link href={`/indicators/${series.id}`} className="quote-card panel">
      <div className="quote-heading">
        <span>{series.nameZh}</span>
        <ArrowUpRight size={13} />
      </div>
      <div className="quote-symbol">{series.providerSymbol}</div>
      <div className="quote-price">
        {formatValue(quote?.value)}
        <small>{unitLabel(series.unit)}</small>
      </div>
      <div
        className={`quote-change ${difference !== null ? (difference >= 0 ? "positive" : "negative") : ""}`}
      >
        {difference !== null ? (
          <>
            {difference >= 0 ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}{" "}
            {difference >= 0 ? "+" : ""}
            {formatValue(rate ? difference : pct)}
            {rate ? " 百分点" : "%"} <span>较前值</span>
          </>
        ) : (
          <span>暂无可比前值</span>
        )}
      </div>
      <div className="quote-bottom">
        <Badge status={quote?.isDemo ? "demo" : quote?.status || "暂无数据"} />
        <span>{quote?.asOf?.slice(0, 10) || "—"}</span>
      </div>
      {quote && (
        <div className="quote-source">
          <span>
            {quote.source.label}
            {quote.sourceChanged ? " · 来源变更" : ""}
          </span>
          <span>采集 {dateTime(quote.fetchedAt)}</span>
        </div>
      )}
      {quote?.message && <p className="small muted">{quote.message}</p>}
    </Link>
  );
}
export function MetricWidget({ seriesId }: { seriesId: string }) {
  const quotes = useRemote<{ items: Quote[] }>(
    `/api/v1/quotes?seriesIds=${seriesId}`,
  );
  const meta = useRemote<Series>(`/api/v1/series/${seriesId}/metadata`);
  return (
    <>
      <ErrorNotice message={quotes.error || meta.error} />
      {meta.data && (
        <QuoteCard series={meta.data} quote={quotes.data?.items[0]} />
      )}
    </>
  );
}
export function IndicatorTable({ ids }: { ids: string[] }) {
  const quotes = useRemote<{ items: Quote[] }>(
    `/api/v1/quotes?seriesIds=${ids.join(",")}`,
  );
  const catalog = useRemote<{ items: Series[] }>("/api/v1/catalog");
  return (
    <>
      <ErrorNotice message={quotes.error} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>指标 / 数据来源</th>
              <th>最新观测</th>
              <th>数据截至</th>
            </tr>
          </thead>
          <tbody>
            {quotes.data?.items.map((q) => (
              <tr key={q.seriesId}>
                <td>
                  <Link href={`/indicators/${q.seriesId}`}>
                    {catalog.data?.items.find((s) => s.id === q.seriesId)
                      ?.nameZh || q.seriesId}
                  </Link>
                  <small>
                    {q.source.label} {q.sourceChanged ? "· 来源已变更" : ""}
                  </small>
                </td>
                <td>
                  <strong>{formatValue(q.value)}</strong>
                  <small>{unitLabel(q.unit)}</small>
                </td>
                <td>
                  <Badge status={q.isDemo ? "demo" : q.status} />
                  <small>{q.asOf?.slice(0, 10) || "—"}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function SourceHealth() {
  const remote = useRemote<{
    items: {
      id: string;
      displayName: string;
      enabled: boolean;
      health?: { status: string; checkedAt: string };
      credential: { configured: boolean };
      envVar?: string;
    }[];
  }>("/api/providers/catalog");
  return (
    <div className="source-health">
      <ErrorNotice message={remote.error} />
      {remote.data?.items.map((p) => (
        <div key={p.id}>
          <span>
            <Database size={14} />
            {p.displayName}
          </span>
          <Badge
            status={
              !p.enabled
                ? "disabled"
                : p.health?.status ||
                  (p.envVar && !p.credential.configured
                    ? "not_configured"
                    : "尚未测试")
            }
          />
        </div>
      ))}
      <Link href="/settings/data-sources">
        管理数据源与预算 <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
export function LatestQuoteDetails({ seriesId }: { seriesId: string }) {
  const remote = useRemote<{ items: Quote[] }>(
    `/api/v1/quotes?seriesIds=${seriesId}`,
  );
  const quote = remote.data?.items[0];
  return (
    <>
      <ErrorNotice message={remote.error} />
      {remote.loading ? (
        <Loading />
      ) : quote ? (
        <div className="panel detail-quote">
          <div>
            <span className="muted">最新参考观测</span>
            <h2>
              {formatValue(quote.value)} <small>{unitLabel(quote.unit)}</small>
            </h2>
            <Badge status={quote.isDemo ? "demo" : quote.status} />
          </div>
          <dl>
            <div>
              <dt>数据来源</dt>
              <dd>
                <a href={quote.source.url} target="_blank" rel="noreferrer">
                  {quote.source.label}
                </a>
              </dd>
            </div>
            <div>
              <dt>数据截至</dt>
              <dd>{dateTime(quote.asOf)}</dd>
            </div>
            <div>
              <dt>采集时间</dt>
              <dd>{dateTime(quote.fetchedAt)}</dd>
            </div>
          </dl>
          {quote.message && <p className="notice">{quote.message}</p>}
          {quote.sourceChanged && (
            <p className="notice">来源已变更，请核对数据口径与时间。</p>
          )}
        </div>
      ) : (
        <Empty>暂无报价</Empty>
      )}
    </>
  );
}
