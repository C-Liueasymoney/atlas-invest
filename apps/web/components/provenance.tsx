"use client";
import { useRemote, dateTime } from "./api";
import { Empty, ErrorNotice, Loading } from "./ui";
type Batch = {
  id: string;
  fileName: string;
  fileSha256: string;
  statPeriodEnd: string;
  releasedAt: string | null;
  importedAt: string;
  sourceUrl: string;
  rowCount: number;
  metadata: { unit?: string };
};
export function ImportHistory({ seriesId }: { seriesId: string }) {
  const remote = useRemote<{ items: Batch[] }>(
    `/api/v1/series/${encodeURIComponent(seriesId)}/imports`,
  );
  return (
    <section className="panel metadata-panel">
      <h2>导入来源与统计期</h2>
      <p className="small muted">
        最近20个批次；图表按统计观察日期绘制，不按发布日期插值。未知发布时间保留为空。
      </p>
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      {remote.loading ? (
        <Loading />
      ) : !remote.data?.items.length ? (
        <Empty>尚无正式导入批次，Demo 不向正式表写入。</Empty>
      ) : (
        remote.data.items.map((b) => (
          <article key={b.id} className="form-section">
            <h3>{b.fileName}</h3>
            <dl>
              <div>
                <dt>统计截至</dt>
                <dd>{b.statPeriodEnd}</dd>
              </div>
              <div>
                <dt>原始发布</dt>
                <dd>
                  {b.releasedAt ? dateTime(b.releasedAt) : "未知（未伪造）"}
                </dd>
              </div>
              <div>
                <dt>导入时间</dt>
                <dd>{dateTime(b.importedAt)}</dd>
              </div>
              <div>
                <dt>单位 / 行数</dt>
                <dd>
                  {b.metadata.unit} / {b.rowCount}
                </dd>
              </div>
            </dl>
            <p className="small muted" style={{ wordBreak: "break-all" }}>
              SHA256 {b.fileSha256}
            </p>
            <a href={b.sourceUrl} target="_blank" rel="noreferrer">
              官方原始来源
            </a>
          </article>
        ))
      )}
    </section>
  );
}
