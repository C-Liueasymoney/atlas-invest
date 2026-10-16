import { randomUUID } from "node:crypto";
import { query, database, demoMode } from "../db/client";
import { OWNER_ID } from "../auth/session";
import { providerById, providers } from "./registry";
import { encryptSecret, decryptSecret } from "./secrets";
import { catalog, seriesById } from "../catalog";
import { defaultRoute } from "./routing";
import type { Budget, Health, Route } from "../types";
import { AppError } from "../errors";
const memory = {
  configs: new Map<string, { enabled: boolean; config: Budget }>(),
  health: new Map<string, Health>(),
  routes: new Map<string, Route[]>(),
  usage: [] as {
    providerId: string;
    at: number;
    cacheHit: boolean;
    error?: string;
  }[],
  capabilities: [] as {
    providerId: string;
    operation: string;
    interval: string;
    symbol: string;
    status: string;
    checkedAt: string;
  }[],
};
export async function credential(id: string) {
  const p = providerById(id);
  const env = p.envVar && process.env[p.envVar];
  if (env)
    return { key: env, configured: true, last4: env.slice(-4), source: "env" };
  if (demoMode()) return { key: undefined, configured: false, source: "none" };
  const [row] = await query<{
    secret_ciphertext: string;
    secret_last4: string;
  }>(
    "SELECT secret_ciphertext,secret_last4 FROM provider_credentials WHERE provider_id=$1 AND owner_id=$2",
    [id, OWNER_ID],
  );
  return row
    ? {
        key: decryptSecret(
          row.secret_ciphertext,
          process.env.CREDENTIAL_ENCRYPTION_KEY || "",
        ),
        configured: true,
        last4: row.secret_last4,
        source: "database",
      }
    : { key: undefined, configured: false, source: "none" };
}
export async function saveCredential(id: string, key: string | null) {
  const p = providerById(id);
  if (!p.envVar) throw new AppError("VALIDATION_ERROR", "该数据源不需要凭据");
  if (process.env[p.envVar])
    throw new AppError(
      "FORBIDDEN",
      "凭据由环境变量管理，请在部署环境修改",
      409,
    );
  if (demoMode())
    throw new AppError(
      "FORBIDDEN",
      "Demo 不保存 API Key，请切换 live 或使用服务端环境变量",
      409,
    );
  if (key === null)
    await query(
      "DELETE FROM provider_credentials WHERE provider_id=$1 AND owner_id=$2",
      [id, OWNER_ID],
    );
  else
    await query(
      "INSERT INTO provider_credentials(id,provider_id,owner_id,secret_ciphertext,secret_last4) VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider_id,owner_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,secret_last4=EXCLUDED.secret_last4,updated_at=now()",
      [
        randomUUID(),
        id,
        OWNER_ID,
        encryptSecret(key, process.env.CREDENTIAL_ENCRYPTION_KEY || ""),
        key.slice(-4),
      ],
    );
  await query("DELETE FROM provider_cache WHERE provider_id=$1", [id]);
  await saveHealth({
    providerId: id,
    status: key ? "unavailable" : "not_configured",
    checkedAt: new Date().toISOString(),
    message: key ? "凭据已更新，请重新测试连接" : "凭据已删除",
  });
  await audit("credential." + (key ? "save" : "delete"), id);
}
export async function providerConfig(id: string) {
  const p = providerById(id);
  if (demoMode())
    return (
      memory.configs.get(id) ?? { enabled: p.enabled, config: { ...p.config } }
    );
  const [row] = await query<{ enabled: boolean; config: Partial<Budget> }>(
    "SELECT enabled,config FROM providers WHERE id=$1",
    [id],
  );
  return {
    enabled: row?.enabled ?? p.enabled,
    config: { ...p.config, ...row?.config },
  };
}
export async function saveConfig(id: string, enabled: boolean, config: Budget) {
  if (demoMode()) memory.configs.set(id, { enabled, config });
  else
    await query(
      "UPDATE providers SET enabled=$2,config=$3::jsonb WHERE id=$1",
      [id, enabled, JSON.stringify(config)],
    );
  await audit("provider.configure", id);
}
export async function health(id: string): Promise<Health | undefined> {
  if (demoMode()) return memory.health.get(id);
  const [r] = await query<{
    status: Health["status"];
    checked_at: Date;
    sample_data_asof: Date | null;
    message: string;
  }>(
    "SELECT * FROM provider_health_checks WHERE provider_id=$1 ORDER BY checked_at DESC LIMIT 1",
    [id],
  );
  return r
    ? {
        providerId: id,
        status: r.status,
        checkedAt: r.checked_at.toISOString(),
        sampleDataAsOf: r.sample_data_asof?.toISOString(),
        message: r.message,
      }
    : undefined;
}
export async function saveHealth(
  h: Health,
  operation = "quote",
  interval = "quote",
  symbol = "XAU",
) {
  if (demoMode()) {
    memory.health.set(h.providerId, h);
    memory.capabilities = memory.capabilities.filter(
      (c) =>
        !(
          c.providerId === h.providerId &&
          c.operation === operation &&
          c.symbol === symbol
        ),
    );
    memory.capabilities.push({
      providerId: h.providerId,
      operation,
      interval,
      symbol,
      status: h.status,
      checkedAt: h.checkedAt,
    });
    return;
  }
  await query(
    "INSERT INTO provider_health_checks(id,provider_id,status,checked_at,sample_data_asof,message) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      h.providerId,
      h.status,
      h.checkedAt,
      h.sampleDataAsOf ?? null,
      h.message,
    ],
  );
  await query(
    "INSERT INTO provider_capabilities(provider_id,operation,interval,symbol,status,source_url,checked_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(provider_id,operation,interval,symbol) DO UPDATE SET status=EXCLUDED.status,checked_at=EXCLUDED.checked_at",
    [
      h.providerId,
      operation,
      interval,
      symbol,
      h.status,
      providerById(h.providerId).docsUrl,
      h.checkedAt,
    ],
  );
}
export async function getCapabilities(id: string) {
  return demoMode()
    ? memory.capabilities.filter((c) => c.providerId === id)
    : query(
        "SELECT operation,interval,symbol,status,checked_at,source_url FROM provider_capabilities WHERE provider_id=$1",
        [id],
      );
}
export async function getRoutes(id: string): Promise<Route[]> {
  const s = seriesById(id);
  if (demoMode()) return memory.routes.get(id) ?? [defaultRoute(s)];
  const rows = await query<{
    provider_id: string;
    provider_symbol: string;
    operation: string;
    interval: string;
    priority: number;
    enabled: boolean;
    constraints_json: Route["constraints"];
    mode: string;
  }>(
    "SELECT * FROM series_provider_routes WHERE canonical_series_id=$1 ORDER BY priority",
    [id],
  );
  return rows.length
    ? rows.map((r) => ({
        providerId: r.provider_id,
        providerSymbol: r.provider_symbol,
        operation: r.operation,
        interval: r.interval,
        priority: r.priority,
        enabled: r.enabled,
        constraints: r.constraints_json,
        mode: r.mode,
      }))
    : [defaultRoute(s)];
}
export async function setRoutes(id: string, routes: Route[]) {
  if (demoMode()) memory.routes.set(id, routes);
  else
    await database().begin(async (tx) => {
      await tx`DELETE FROM series_provider_routes WHERE canonical_series_id=${id}`;
      for (const r of routes)
        await tx`INSERT INTO series_provider_routes(canonical_series_id,provider_id,provider_symbol,operation,interval,priority,enabled,constraints_json,mode) VALUES(${id},${r.providerId},${r.providerSymbol},${r.operation},${r.interval},${r.priority},${r.enabled},${tx.json(r.constraints)},${r.mode})`;
    });
  await audit("route.save", id);
}
export async function usage(id: string) {
  if (demoMode()) {
    const all = memory.usage.filter(
      (u) => u.providerId === id && u.at > Date.now() - 86400000,
    );
    return {
      requests24h: all.filter((u) => !u.cacheHit).length,
      cacheHits: all.filter((u) => u.cacheHit).length,
      rateLimited: all.filter((u) => u.error === "rate_limited").length,
      estimate: true,
    };
  }
  const [r] = await query<{ requests: string; hits: string; limited: string }>(
    "SELECT count(*) FILTER(WHERE NOT cache_hit)::text as requests,count(*) FILTER(WHERE cache_hit)::text as hits,count(*) FILTER(WHERE error_category='rate_limited')::text as limited FROM provider_request_usage WHERE provider_id=$1 AND requested_at>now()-interval '24 hours'",
    [id],
  );
  return {
    requests24h: Number(r.requests),
    cacheHits: Number(r.hits),
    rateLimited: Number(r.limited),
    estimate: true,
  };
}
export async function audit(action: string, id: string) {
  if (!demoMode())
    await query(
      "INSERT INTO audit_logs(id,owner_id,action,resource_id) VALUES($1,$2,$3,$4)",
      [randomUUID(), OWNER_ID, action, id],
    );
}
export async function publicProviders() {
  return Promise.all(
    providers.map(async (p) => {
      const { key: _key, ...safe } = await credential(p.id);
      void _key;
      return {
        ...p,
        configurationSchema: undefined,
        ...(await providerConfig(p.id)),
        credential: safe,
        health: await health(p.id),
        coverageCount: catalog.filter((s) => s.providerId === p.id).length,
      };
    }),
  );
}
export { memory };
