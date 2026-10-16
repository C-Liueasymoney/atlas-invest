import { randomUUID } from "node:crypto";
import { AppError } from "../errors";
import type { Budget } from "../types";
import { database, demoMode } from "../db/client";
import { providerConfig, memory } from "./repository";
interface Cached {
  value: unknown;
  expires: number;
}
interface Usage {
  at: number;
  cacheHit: boolean;
  error?: string;
}
export interface ControllerStore {
  exclusive<T>(
    provider: string,
    fn: (store: ControllerStore) => Promise<T>,
  ): Promise<T>;
  get(key: string): Promise<Cached | undefined>;
  put(key: string, value: Cached): Promise<void>;
  usage(provider: string): Promise<Usage[]>;
  record(provider: string, u: Usage): Promise<void>;
}
export class MemoryControllerStore implements ControllerStore {
  private cache = new Map<string, Cached>();
  private used = new Map<string, Usage[]>();
  private queue = new Map<string, Promise<unknown>>();
  async exclusive<T>(
    provider: string,
    fn: (store: ControllerStore) => Promise<T>,
  ): Promise<T> {
    const next: Promise<T> = (
      this.queue.get(provider) ?? Promise.resolve()
    ).then(() => fn(this));
    this.queue.set(
      provider,
      next.catch(() => {}),
    );
    return next;
  }
  async get(k: string) {
    return this.cache.get(k);
  }
  async put(k: string, v: Cached) {
    this.cache.set(k, v);
  }
  async usage(p: string) {
    return this.used.get(p) ?? [];
  }
  async record(p: string, u: Usage) {
    const rows = (this.used.get(p) ?? []).filter((x) => x.at > u.at - 86400000);
    rows.push(u);
    this.used.set(p, rows);
    memory.usage.push({ providerId: p, ...u });
  }
}
export class ProviderController {
  constructor(
    private store: ControllerStore,
    private clock = () => Date.now(),
  ) {}
  async execute<T>(
    provider: string,
    key: string,
    budget: Budget,
    load: () => Promise<{ value: T; maxAgeSeconds?: number }>,
  ): Promise<T> {
    const result = await this.store.exclusive(provider, async (store) => {
      const now = this.clock(),
        cached = await store.get(provider + ":" + key);
      if (cached && cached.expires > now) {
        await store.record(provider, { at: now, cacheHit: true });
        return { value: cached.value as T };
      }
      const circuit = await store.get(provider + ":circuit");
      if (circuit && circuit.expires > now)
        return {
          error: new AppError(
            "SOURCE_RATE_LIMITED",
            "数据源处于故障冷却期，请稍后重试",
            429,
          ),
        };
      const used = (await store.usage(provider)).filter((u) => !u.cacheHit);
      if (
        [
          [60000, budget.perMinute],
          [3600000, budget.perHour],
          [86400000, budget.perDay],
        ].some(
          ([window, limit]) =>
            used.filter((u) => u.at > now - window).length >= limit,
        )
      )
        return {
          error: new AppError(
            "SOURCE_RATE_LIMITED",
            "本地请求预算已耗尽，等待窗口恢复",
            429,
          ),
        };
      try {
        const loaded = await load();
        await store.record(provider, { at: now, cacheHit: false });
        await store.put(provider + ":" + key, {
          value: loaded.value,
          expires:
            now +
            Math.max(30, budget.ttlSeconds, loaded.maxAgeSeconds ?? 0) * 1000,
        });
        return { value: loaded.value };
      } catch (e) {
        const err =
          e instanceof AppError
            ? e
            : new AppError("SOURCE_UNAVAILABLE", "上游响应无效或请求超时", 503);
        await store.record(provider, {
          at: now,
          cacheHit: false,
          error:
            err.code === "SOURCE_RATE_LIMITED" ? "rate_limited" : "unavailable",
        });
        await store.put(provider + ":circuit", {
          value: null,
          expires: now + 60000,
        });
        return { error: err };
      }
    });
    if (result.error) throw result.error;
    return result.value as T;
  }
}
class PostgresControllerStore implements ControllerStore {
  constructor(
    private q?: <T extends object>(
      text: string,
      p: (string | number | boolean | null)[],
    ) => Promise<T[]>,
  ) {}
  async exclusive<T>(
    provider: string,
    fn: (s: ControllerStore) => Promise<T>,
  ): Promise<T> {
    return database().begin(async (tx) => {
      const q = async <R extends object>(
        text: string,
        p: (string | number | boolean | null)[],
      ) => [...(await tx.unsafe<R[]>(text, p))];
      await q("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "provider:" + provider,
      ]);
      return fn(new PostgresControllerStore(q));
    }) as Promise<T>;
  }
  async get(k: string) {
    const [r] = await this.q!<{ payload: unknown; expires_at: Date }>(
      "SELECT payload,expires_at FROM provider_cache WHERE cache_key=$1",
      [k],
    );
    return r
      ? { value: r.payload, expires: r.expires_at.getTime() }
      : undefined;
  }
  async put(k: string, c: Cached) {
    await this.q!(
      "INSERT INTO provider_cache(cache_key,provider_id,payload,expires_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at",
      [
        k,
        k.split(":")[0],
        JSON.stringify(c.value),
        new Date(c.expires).toISOString(),
      ],
    );
  }
  async usage(p: string) {
    const rows = await this.q!<{
      requested_at: Date;
      cache_hit: boolean;
      error_category: string;
    }>(
      "SELECT requested_at,cache_hit,error_category FROM provider_request_usage WHERE provider_id=$1 AND requested_at>now()-interval '24 hours'",
      [p],
    );
    return rows.map((r) => ({
      at: r.requested_at.getTime(),
      cacheHit: r.cache_hit,
      error: r.error_category,
    }));
  }
  async record(p: string, u: Usage) {
    await this.q!(
      "INSERT INTO provider_request_usage(id,provider_id,requested_at,result_type,cache_hit,error_category) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        p,
        new Date(u.at).toISOString(),
        u.error ?? "success",
        u.cacheHit,
        u.error ?? null,
      ],
    );
  }
}
const mem = new MemoryControllerStore();
export async function controlled<T>(
  id: string,
  key: string,
  load: () => Promise<{ value: T; maxAgeSeconds?: number }>,
) {
  const p = await providerConfig(id);
  if (!p.enabled) throw new AppError("SOURCE_UNAVAILABLE", "数据源已停用", 503);
  return new ProviderController(
    demoMode() ? mem : new PostgresControllerStore(),
  ).execute(id, key, p.config, load);
}
