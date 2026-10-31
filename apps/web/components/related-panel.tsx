"use client";
import { useState } from "react";
import { api, json, useRemote, Series, Quote } from "./api";
import {
  ActionFeedback,
  Empty,
  ErrorNotice,
  Loading,
  Modal,
  useAction,
} from "./ui";
import { RelatedMarkets } from "./market-focus";
type Preferences = {
  seriesId: string;
  items: string[];
  recommended: string[];
  customized: boolean;
};
export function RelatedPanel({
  focus,
  catalog,
  version,
}: {
  focus: string;
  catalog: Series[];
  version: number;
}) {
  const remote = useRemote<Preferences>(
    `/api/v1/market/related/${encodeURIComponent(focus)}`,
  );
  const current = remote.data?.seriesId === focus ? remote.data : undefined;
  const series = (current?.items || [])
    .map((id) => catalog.find((s) => s.id === id))
    .filter((s): s is Series => !!s);
  const quotes = useRemote<{ items: Quote[] }>(
    series.length
      ? `/api/v1/quotes?seriesIds=${series.map((s) => s.id).join(",")}&version=${version}`
      : null,
  );
  const [draft, setDraft] = useState<string[] | null>(null),
    [search, setSearch] = useState("");
  const action = useAction();
  return (
    <div className="related-panel">
      <ErrorNotice
        message={remote.error || quotes.error}
        retry={() => {
          remote.refresh();
          quotes.refresh();
        }}
      />
      {!current ? (
        <Loading />
      ) : (
        <>
          <RelatedMarkets
            series={series}
            quotes={quotes.data?.items || []}
            onManage={() => {
              setDraft([...current.items]);
              setSearch("");
            }}
          />
          {!series.length && (
            <Empty>尚未添加关联指标，点击「管理关联」添加。</Empty>
          )}
        </>
      )}
      {draft !== null && current && (
        <Modal
          title="管理关联指标"
          onClose={() => {
            if (!action.busy) setDraft(null);
          }}
        >
          <p>
            为「{catalog.find((s) => s.id === focus)?.nameZh}
            」选择关联指标。可从全部指标添加，与收藏独立。
          </p>
          <label>
            搜索指标
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名称或代码"
            />
          </label>
          <p className="small muted">
            已选 {draft.length} 项 · 最多20项 ·
            推荐用于研究对照，不代表统计相关性
          </p>
          <div className="related-picker">
            {catalog
              .filter(
                (s) =>
                  s.id !== focus &&
                  `${s.nameZh} ${s.id} ${s.providerSymbol}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((s) => (
                <label className="checkbox" key={s.id}>
                  <input
                    type="checkbox"
                    checked={draft.includes(s.id)}
                    disabled={action.busy}
                    onChange={(e) =>
                      setDraft(
                        e.target.checked
                          ? [...draft, s.id]
                          : draft.filter((id) => id !== s.id),
                      )
                    }
                  />
                  <span>
                    {s.nameZh}
                    <small>
                      {current.recommended.includes(s.id)
                        ? "推荐对照"
                        : "可自定义添加"}
                    </small>
                  </span>
                </label>
              ))}
          </div>
          <ActionFeedback action={action} />
          <div className="actions">
            <button disabled={action.busy} onClick={() => setDraft([])}>
              清空
            </button>
            <button
              disabled={action.busy}
              onClick={() => setDraft([...current.recommended])}
            >
              恢复推荐
            </button>
            <button
              className="primary"
              disabled={action.busy || draft.length > 20}
              onClick={() =>
                action.run(async () => {
                  const saved = await api<Preferences>(
                    `/api/v1/market/related/${encodeURIComponent(focus)}`,
                    json("PUT", { items: draft }),
                  );
                  remote.setData(saved);
                  setDraft(null);
                }, "关联指标已保存")
              }
            >
              保存关联指标
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
