"use client";
import { formatValue, useRemote } from "./api";
import { Badge, ErrorNotice, Loading } from "./ui";
type Risk = {
  maxDrawdownPct: number | null;
  annualizedVolatilityPct: number | null;
  rollingVolatility21Pct: number | null;
  sampleCount: number;
  annualizationDays: number;
  returnDistribution: { label: string; count: number }[];
  status: string;
  isDemo: boolean;
  observationBasis: string;
};
export function RiskPanel({ seriesId }: { seriesId: string }) {
  const remote = useRemote<Risk>(
    `/api/v1/series/${encodeURIComponent(seriesId)}/stats`,
  );
  const r = remote.data;
  return (
    <section className="panel metadata-panel">
      <div className="panel-heading">
        <h2>历史风险观察</h2>
        {r && <Badge status={r.isDemo ? "demo" : r.status} />}
      </div>
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : (
        r && (
          <>
            <dl>
              <div>
                <dt>历史最大回撤</dt>
                <dd>{formatValue(r.maxDrawdownPct)}%</dd>
              </div>
              <div>
                <dt>历史年化波动</dt>
                <dd>{formatValue(r.annualizedVolatilityPct)}%</dd>
              </div>
              <div>
                <dt>最近21个间隔年化波动</dt>
                <dd>{formatValue(r.rollingVolatility21Pct)}%</dd>
              </div>
              <div>
                <dt>有效观察点</dt>
                <dd>{r.sampleCount}</dd>
              </div>
            </dl>
            <h3>相邻观察点收益分布</h3>
            <div className="risk-distribution">
              {r.returnDistribution.map((b) => (
                <div key={b.label}>
                  <span>{b.label}</span>
                  <meter
                    min={0}
                    max={Math.max(1, r.sampleCount - 1)}
                    value={b.count}
                  />
                  <span>{b.count}</span>
                </div>
              ))}
            </div>
            <p className="small muted">
              {r.observationBasis}
              。缺失日不插值；窗口基于当前已存储历史，历史统计不代表未来风险。
            </p>
          </>
        )
      )}
    </section>
  );
}
