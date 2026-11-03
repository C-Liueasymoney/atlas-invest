"use client";
import { useRemote, formatValue, dateTime } from "./api";
import { ErrorNotice, Loading, Badge } from "./ui";
import type { PeriodResult } from "../lib/inflation-period";
import { inflationInputs } from "../lib/inflation-period";
import type { Source } from "../lib/types";
type Summary = PeriodResult & {
  source: Source;
  sourceStatus: string;
  isDemo: boolean;
  fetchedAt: string | null;
};
export function InflationSummary({
  seriesId,
  from = "",
  to = "",
}: {
  seriesId: string;
  from?: string;
  to?: string;
}) {
  const percent = (value: string | null) =>
    value === null
      ? "—"
      : Number(value).toLocaleString("zh-CN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const currencyLabel = seriesId === "US_CPI_YOY_M" ? "美元" : "元人民币";
  const supported = Object.hasOwn(inflationInputs, seriesId);
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const remote = useRemote<Summary>(
    supported
      ? `/api/v1/inflation/${encodeURIComponent(seriesId)}/summary?${params}`
      : null,
  );
  if (!supported) return null;
  const data = remote.data;
  return (
    <section
      className="inflation-summary"
      aria-label={`${seriesId === "US_CPI_YOY_M" ? "美国" : "中国"}区间物价与购买力`}
    >
      <h3>
        {seriesId === "US_CPI_YOY_M" ? "美国" : "中国"} · 区间物价与购买力
        {data?.estimated ? "（估算）" : ""}
      </h3>
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <Badge status={data.isDemo ? "demo" : data.sourceStatus} />
            {data.status === "available" ? (
              <>
                <p>
                  实际区间：{data.actualFrom?.slice(0, 7)} 至{" "}
                  {data.actualTo?.slice(0, 7)} · {data.months}个月
                </p>
                <div className="inflation-metrics">
                  <div>
                    <span>累计物价涨幅</span>
                    <strong>{percent(data.cumulativePct)}%</strong>
                  </div>
                  <div>
                    <span>年均涨幅（复合年化）</span>
                    <strong>{percent(data.annualizedPct)}%</strong>
                  </div>
                  <div>
                    <span>维持期初1万{currencyLabel}消费所需金额</span>
                    <strong>
                      {seriesId === "US_CPI_YOY_M" ? "$" : "¥"}
                      {formatValue(data.equivalentAmount)}
                    </strong>
                  </div>
                </div>
                <p>
                  不计利息，今天的1万{currencyLabel}相当于期初{" "}
                  {formatValue(data.realValue)} {currencyLabel}
                  购买力，同额现金购买力变化 {percent(data.purchasingPowerPct)}
                  %。美国金额以美元计，中国以人民币计。
                </p>
                {(data.startTruncated || data.endTruncated) && (
                  <p className="notice">
                    所选范围未被数据完全覆盖；以上仅按标出的实际月份计算，未外推到未发布或缺失月份。
                  </p>
                )}
              </>
            ) : (
              <p>
                {data.sourceStatus === "not_configured"
                  ? "请先配置 FRED Key 并同步原始 CPI 指数。"
                  : data.message}
              </p>
            )}
            <p className="muted small">
              {data.message}{" "}
              <a href={data.source.url} target="_blank" rel="noreferrer">
                {data.source.label}
              </a>{" "}
              · 采集 {dateTime(data.fetchedAt)}
              。月初仅标识观察月份；平均消费篮子不代表个人支出，不计利息、工资增长或汇率变化。
            </p>
          </>
        )
      )}
    </section>
  );
}
