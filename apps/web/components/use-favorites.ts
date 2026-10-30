"use client";
import { useRef } from "react";
import { api, json, useRemote } from "./api";
import { useAction } from "./ui";

type Watchlist = { id: string; name: string; items: string[] };

// Keep the same default list used by the catalog's original add action.
export function useFavorites() {
  const remote = useRemote<{ items: Watchlist[] }>("/api/v1/watchlists");
  const action = useAction();
  const pending = useRef(false);
  const list = remote.data?.items[0];
  const has = (id: string) => list?.items.includes(id) ?? false;
  async function toggle(seriesId: string) {
    if (pending.current || remote.loading || !remote.data || remote.error)
      return;
    pending.current = true;
    const removing = has(seriesId);
    try {
      await action.run(
        async () => {
          const target =
            list ||
            (await api<Watchlist>(
              "/api/v1/watchlists",
              json("POST", { name: "我的观察列表" }),
            ));
          // Retain a newly created empty list even if adding its first item fails.
          if (!list) remote.setData({ items: [target] });
          const saved = await api<Watchlist>(
            `/api/v1/watchlists/${encodeURIComponent(target.id)}/items${removing ? `/${encodeURIComponent(seriesId)}` : ""}`,
            removing ? json("DELETE") : json("POST", { seriesId }),
          );
          remote.setData((current) => ({
            items: [saved, ...(current?.items.slice(1) ?? [])],
          }));
        },
        removing ? "已取消自选" : "已加入观察列表",
      );
    } finally {
      pending.current = false;
    }
  }
  return {
    has,
    toggle,
    action,
    disabled: remote.loading || !remote.data || !!remote.error || action.busy,
    error: remote.error,
    refresh: remote.refresh,
  };
}
