"use client";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { dateTime, formatValue, Quote, Series, unitLabel } from "./api";
import { Badge } from "./ui";
export function quoteChange(quote?: Quote) {
  if (!quote || quote.isDemo || quote.value == null)
    return { absolute: null, percent: null, official: false };
  const numeric = (value: unknown) =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const explicit = numeric(quote.changeAbsolute);
  const explicitPercent = numeric(quote.changePercent);
  const current = numeric(quote.value);
  const previous = numeric(quote.previousValue);
  const absolute =
    explicit ??
    (current !== null && previous !== null ? current - previous : null);
  const percent =
    explicitPercent ??
    (absolute !== null && previous !== null && previous !== 0
      ? (absolute / previous) * 100
      : null);
  return {
    absolute,
    percent,
    official: explicit !== null || explicitPercent !== null,
  };
}
export function focusPrice(quote?: Quote) {
  if (
    !quote ||
    quote.isDemo ||
    quote.value === null ||
    quote.value === "" ||
    !Number.isFinite(Number(quote.value))
  )
    return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: quote.unit === "CNY/USD" ? 4 : 2,
    maximumFractionDigits: quote.unit === "CNY/USD" ? 4 : 2,
  }).format(Number(quote.value));
}
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
export function frequencyDescription(series?: Series) {
  if (series?.id === "SGE_AU9999_D1") return "日线收盘 · CNY/g";
  const frequency = series?.frequency || "";
  return (
    {
      "1d": "日度观察",
      daily: "日度观察",
      "1w": "周度观察",
      weekly: "周度观察",
      "1mo": "月度观察",
      monthly: "月度观察",
      quote: "最新参考报价",
    }[frequency] ||
    frequency ||
    "待确认频率"
  );
}
export function isDashboardFocusSeries(series: Series) {
  return (
    series.kind === "ohlc" ||
    series.id === "FX_USDCNY_D1" ||
    series.category === "equity_index"
  );
}
function marketDescription(series?: Series) {
  if (series?.providerId === "akshare_sge" || series?.id.startsWith("SGE_"))
    return "上海黄金交易所";
  if (series?.category === "equity_index") return "美国股票指数";
  return series?.providerId || "上海黄金交易所";
}
export function MarketHero({
  series,
  quote,
  actions,
}: {
  series?: Series;
  quote?: Quote;
  actions?: React.ReactNode;
}) {
  const delta = quoteChange(quote);
  const rate = series?.unit === "percent" || series?.unit === "%";
  const demo = quote?.isDemo;
  const title = series?.nameZh.replace(/ 日线$/, "") || "国内黄金 Au99.99";
  return (
    <section className="market-hero" aria-label="主要行情">
      <div className="symbol-heading">
        <div className="symbol-avatar">
          {series?.category === "gold"
            ? "Au"
            : series?.category === "equity_index"
              ? "IDX"
              : series?.currency || "Au"}
        </div>
        <div>
          <h1>{title}</h1>
          <div className="symbol-caption">
            <span>{series?.providerSymbol || "Au99.99"}</span>
            <span>·</span>
            <span>{marketDescription(series)}</span>
            <span>·</span>
            <span>{frequencyDescription(series)}</span>
          </div>
        </div>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
      <div className="focus-price-row">
        <div className="focus-price" data-testid="focus-price">
          {focusPrice(quote)}
          <span>{unitLabel(series?.unit || quote?.unit || "CNY/g")}</span>
        </div>
        {demo ? (
          <div className="focus-demo">
            <strong>演示数据</strong>
            <span>体验图表，不展示为市场报价</span>
          </div>
        ) : delta.absolute !== null ? (
          <div
            className={`focus-change ${delta.absolute >= 0 ? "positive" : "negative"}`}
          >
            <strong>
              {signed(delta.absolute)}
              {rate ? " 百分点" : null}
              {!rate && delta.percent !== null && (
                <span>({signed(delta.percent)}%)</span>
              )}
            </strong>
            <small>
              {delta.official
                ? "较上一交易日 · 来源公布变化"
                : "较上一有效观测"}
            </small>
          </div>
        ) : (
          <span className="focus-no-change">
            {quote?.value == null ? "暂无有效观测" : "暂无可比前值"}
          </span>
        )}
      </div>
      <div className="focus-context">
        {demo ? (
          <>
            <Badge status="demo" />
            <Link href="/settings/data-sources">
              配置真实数据源 <ArrowUpRight size={13} />
            </Link>
          </>
        ) : (
          <>
            <span
              className={`market-state-dot ${quote?.status || "unavailable"}`}
            />
            <span>
              {quote?.asOf
                ? quote.asOfKind === "date"
                  ? `数据日期 ${quote.asOf.slice(0, 10)}`
                  : `数据截至 ${dateTime(quote.asOf)}`
                : "等待数据采集"}
            </span>
            {quote && (
              <>
                <span>·</span>
                <a href={quote.source.url} target="_blank" rel="noreferrer">
                  {quote.source.label}
                  <ArrowUpRight size={11} />
                </a>
                <Badge status={quote.status} />
              </>
            )}
            {quote?.sourceChanged && (
              <span className="source-change-label">来源已变更</span>
            )}
          </>
        )}
      </div>
      {quote?.message && !demo && (
        <p className="focus-message">{quote.message}</p>
      )}
    </section>
  );
}
export function RelatedMarkets({
  series,
  quotes,
}: {
  series: Series[];
  quotes: Quote[];
}) {
  return (
    <aside className="related-markets">
      <div className="related-heading">
        <h2>相关指标</h2>
        <Link href="/watchlists">
          自选 <ChevronRight size={13} />
        </Link>
      </div>
      {series.map((s) => {
        const quote = quotes.find((q) => q.seriesId === s.id);
        const delta = quoteChange(quote);
        const rate = s.unit === "percent" || s.unit === "%";
        return (
          <Link
            className="related-market"
            key={s.id}
            href={`/indicators/${s.id}`}
          >
            <div className="related-market-name">
              <strong>
                {s.nameZh
                  .replace(/日度参考汇率/, "汇率")
                  .replace(/美国10年期/, "10年期")
                  .replace(/（非DXY）/, "")}
              </strong>
              <small>
                {s.providerSymbol} · {unitLabel(s.unit)}
              </small>
            </div>
            <div className="related-market-value">
              <strong>
                {quote?.isDemo
                  ? "—"
                  : quote?.unit === "CNY/USD"
                    ? focusPrice(quote)
                    : formatValue(quote?.value)}
              </strong>
              {quote?.isDemo ? (
                <small>演示数据</small>
              ) : delta.percent !== null ? (
                <small className={delta.percent >= 0 ? "positive" : "negative"}>
                  {rate && delta.absolute !== null
                    ? `${signed(delta.absolute)} 百分点`
                    : `${signed(delta.percent)}%`}
                </small>
              ) : (
                <small>
                  {quote?.status === "not_configured"
                    ? "待配置 Key"
                    : quote?.value == null
                      ? "暂无数据"
                      : "无可比前值"}
                </small>
              )}
            </div>
          </Link>
        );
      })}
      <p>
        按各来源实际观察日期更新。
        <br />
        不同市场与指标的发布时间可能不同。
      </p>
      <Link className="related-footer" href="/indicators">
        浏览全部指标 <ArrowUpRight size={13} />
      </Link>
    </aside>
  );
}
