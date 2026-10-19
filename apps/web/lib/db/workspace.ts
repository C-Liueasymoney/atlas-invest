import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { OWNER_ID } from "../auth/session";
import type { Workspace, Widget, Alert, AlertEvent, Note } from "../types";
import { database, demoMode } from "./client";
export function defaultWorkspace(): Workspace {
  return {
    dashboards: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "黄金研究",
        layoutVersion: 1,
        widgets: [
          ["price-chart", "SGE_AU9999_D1", 0, 0, 8, 5],
          ["price-chart", "FRED_DFII10", 8, 0, 4, 5],
          ["price-chart", "FX_USDCNY_D1", 0, 5, 6, 4],
          ["source-health", "", 6, 5, 6, 4],
        ].map(([type, seriesId, x, y, w, h]) => ({
          id: randomUUID(),
          type: String(type),
          config: {
            seriesId,
            chartType: seriesId === "SGE_AU9999_D1" ? "candlestick" : "line",
            range: "1Y",
          },
          layout: { x: Number(x), y: Number(y), w: Number(w), h: Number(h) },
        })),
      },
    ],
    watchlists: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        name: "我的观察",
        items: [
          "SGE_AU9999_D1",
          "XAUUSD_QUOTE",
          "FX_USDCNY_D1",
          "FRED_DFII10",
          "FRED_NASDAQ100",
          "FRED_SP500",
        ],
      },
    ],
    alerts: [],
    events: [],
    notes: [],
  };
}
const demoFile = () =>
  process.env.ATLAS_DEMO_STATE_PATH ||
  resolve(process.cwd(), ".atlas/demo-state.json");
const file = () =>
  process.env.DATA_MODE === "preview"
    ? process.env.ATLAS_PREVIEW_STATE_PATH ||
      resolve(process.cwd(), ".atlas/preview-state.json")
    : demoFile();
let queue: Promise<unknown> = Promise.resolve();
async function demoRead(): Promise<Workspace> {
  try {
    return JSON.parse(await readFile(file(), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    if (process.env.DATA_MODE === "preview") {
      try {
        const previous: Workspace = JSON.parse(
          await readFile(demoFile(), "utf8"),
        );
        // Keep user research preferences, but synthetic price history must never
        // seed real alert comparisons or appear as real trigger history.
        return { ...previous, alerts: [], events: [] };
      } catch (migrationError) {
        if ((migrationError as NodeJS.ErrnoException).code !== "ENOENT")
          throw migrationError;
      }
    }
    return defaultWorkspace();
  }
}
async function demoWrite(state: Workspace) {
  await mkdir(dirname(file()), { recursive: true });
  const tmp = file() + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
  await rename(tmp, file());
}
export async function workspace<T>(
  fn: (state: Workspace) => T | Promise<T>,
  mutate = false,
): Promise<T> {
  if (demoMode()) {
    const job = queue.then(async () => {
      const state = await demoRead();
      const result = await fn(state);
      if (mutate) await demoWrite(state);
      return result;
    });
    queue = job.catch(() => {});
    return job;
  }
  return database().begin(async (tx) => {
    const q = async <T extends object = Record<string, unknown>>(
      text: string,
      p: (string | number | boolean | null)[] = [],
    ): Promise<T[]> => [...(await tx.unsafe<T[]>(text, p))];
    // Serialize updates across web workers. Only a single local owner is supported in V1.
    await q("SELECT pg_advisory_xact_lock(8812001)");
    const ds = await q<{ id: string; name: string; layout_version: number }>(
      "SELECT * FROM dashboards WHERE owner_id=$1",
      [OWNER_ID],
    );
    const ws = await q<{
      id: string;
      dashboard_id: string;
      type: string;
      title: string;
      config: Widget["config"];
      layout_desktop: Widget["layout"];
    }>(
      "SELECT w.* FROM dashboard_widgets w JOIN dashboards d ON d.id=w.dashboard_id WHERE d.owner_id=$1",
      [OWNER_ID],
    );
    const lists = await q<{ id: string; name: string }>(
      "SELECT * FROM watchlists WHERE owner_id=$1 ORDER BY sort_order",
      [OWNER_ID],
    );
    const items = await q<{ watchlist_id: string; series_id: string }>(
      "SELECT i.* FROM watchlist_items i JOIN watchlists w ON w.id=i.watchlist_id WHERE w.owner_id=$1 ORDER BY i.sort_order",
      [OWNER_ID],
    );
    const aa = await q<{
      id: string;
      series_id: string;
      condition_type: string;
      params: Alert["params"];
      enabled: boolean;
      cooldown_seconds: number;
      state: Alert["state"];
      last_fired_at: Date | null;
      last_evaluated_at: Date | null;
    }>("SELECT * FROM alerts WHERE owner_id=$1", [OWNER_ID]);
    const ee = await q<{
      id: string;
      alert_id: string;
      triggered_at: Date;
      observed_value: string | null;
      threshold: string | null;
      series_asof_at: Date | null;
      dedup_key: string;
      status: string;
    }>(
      "SELECT e.* FROM alert_events e JOIN alerts a ON a.id=e.alert_id WHERE a.owner_id=$1 ORDER BY triggered_at DESC LIMIT 1000",
      [OWNER_ID],
    );
    const nn = await q<{
      id: string;
      title: string;
      markdown: string;
      tags: string[];
      series_ids: string[];
      event_date: string | null;
      updated_at: Date;
    }>("SELECT * FROM research_notes WHERE owner_id=$1", [OWNER_ID]);
    const state: Workspace = {
      dashboards: ds.map((d) => ({
        id: d.id,
        name: d.name,
        layoutVersion: d.layout_version,
        widgets: ws
          .filter((w) => w.dashboard_id === d.id)
          .map((w) => ({
            id: w.id,
            type: w.type,
            title: w.title,
            config: w.config,
            layout: w.layout_desktop,
          })),
      })),
      watchlists: lists.map((w) => ({
        ...w,
        items: items
          .filter((i) => i.watchlist_id === w.id)
          .map((i) => i.series_id),
      })),
      alerts: aa.map((a) => ({
        id: a.id,
        seriesId: a.series_id,
        conditionType: a.condition_type,
        params: a.params,
        enabled: a.enabled,
        cooldownSeconds: a.cooldown_seconds,
        state: a.state,
        lastFiredAt: a.last_fired_at?.toISOString(),
        lastEvaluatedAt: a.last_evaluated_at?.toISOString(),
      })),
      events: ee.map((e): AlertEvent => ({
        id: e.id,
        alertId: e.alert_id,
        triggeredAt: e.triggered_at.toISOString(),
        observedValue: e.observed_value,
        threshold: e.threshold,
        seriesAsOf: e.series_asof_at?.toISOString() ?? null,
        dedupKey: e.dedup_key,
        status: e.status,
      })),
      notes: nn.map((n): Note => ({
        id: n.id,
        title: n.title,
        markdown: n.markdown,
        tags: n.tags,
        seriesIds: n.series_ids,
        eventDate: n.event_date,
        updatedAt: n.updated_at.toISOString(),
      })),
    };
    const initial = !ds.length;
    if (initial) {
      const defaults = defaultWorkspace();
      state.dashboards = defaults.dashboards;
      if (!lists.length) state.watchlists = defaults.watchlists;
    }
    const result = await fn(state);
    if (mutate || initial) {
      for (const d of state.dashboards) {
        await q(
          "INSERT INTO dashboards(id,owner_id,name,layout_version) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=now() WHERE dashboards.owner_id=EXCLUDED.owner_id",
          [d.id, OWNER_ID, d.name, d.layoutVersion],
        );
        await q("DELETE FROM dashboard_widgets WHERE dashboard_id=$1", [d.id]);
        for (const w of d.widgets)
          await q(
            "INSERT INTO dashboard_widgets(id,dashboard_id,type,title,config,layout_desktop) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
            [
              w.id,
              d.id,
              w.type,
              w.title ?? null,
              JSON.stringify(w.config),
              JSON.stringify(w.layout),
            ],
          );
      }
      for (const l of state.watchlists) {
        await q(
          "INSERT INTO watchlists(id,owner_id,name) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name WHERE watchlists.owner_id=EXCLUDED.owner_id",
          [l.id, OWNER_ID, l.name],
        );
        await q("DELETE FROM watchlist_items WHERE watchlist_id=$1", [l.id]);
        for (const [i, id] of l.items.entries())
          await q(
            "INSERT INTO watchlist_items(watchlist_id,series_id,sort_order) VALUES($1,$2,$3)",
            [l.id, id, i],
          );
      }
      const keepAlerts = state.alerts.map((a) => a.id);
      await q(
        "DELETE FROM alerts WHERE owner_id=$1 AND NOT(id=ANY($2::uuid[]))",
        [OWNER_ID, "{" + keepAlerts.join(",") + "}"],
      );
      for (const a of state.alerts)
        await q(
          "INSERT INTO alerts(id,owner_id,series_id,condition_type,params,enabled,cooldown_seconds,state,last_fired_at,last_evaluated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,state=EXCLUDED.state,last_fired_at=EXCLUDED.last_fired_at,last_evaluated_at=EXCLUDED.last_evaluated_at WHERE alerts.owner_id=EXCLUDED.owner_id",
          [
            a.id,
            OWNER_ID,
            a.seriesId,
            a.conditionType,
            JSON.stringify(a.params),
            a.enabled,
            a.cooldownSeconds,
            JSON.stringify(a.state),
            a.lastFiredAt ?? null,
            a.lastEvaluatedAt ?? null,
          ],
        );
      for (const e of state.events)
        if (keepAlerts.includes(e.alertId))
          await q(
            "INSERT INTO alert_events(id,alert_id,triggered_at,observed_value,threshold,series_asof_at,dedup_key,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedup_key) DO NOTHING",
            [
              e.id,
              e.alertId,
              e.triggeredAt,
              e.observedValue,
              e.threshold,
              e.seriesAsOf,
              e.dedupKey,
              e.status,
            ],
          );
      await q(
        "DELETE FROM research_notes WHERE owner_id=$1 AND NOT(id=ANY($2::uuid[]))",
        [OWNER_ID, "{" + state.notes.map((n) => n.id).join(",") + "}"],
      );
      for (const n of state.notes)
        await q(
          "INSERT INTO research_notes(id,owner_id,title,markdown,tags,series_ids,event_date,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,markdown=EXCLUDED.markdown,tags=EXCLUDED.tags,series_ids=EXCLUDED.series_ids,event_date=EXCLUDED.event_date,updated_at=EXCLUDED.updated_at WHERE research_notes.owner_id=EXCLUDED.owner_id",
          [
            n.id,
            OWNER_ID,
            n.title,
            n.markdown,
            JSON.stringify(n.tags),
            JSON.stringify(n.seriesIds),
            n.eventDate ?? null,
            n.updatedAt,
          ],
        );
    }
    return result;
  }) as Promise<T>;
}
