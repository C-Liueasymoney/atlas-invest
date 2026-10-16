import { z } from "zod";
import { body, parse, json } from "./api-helpers";
import { AppError } from "./errors";
import { catalog, seriesById } from "./catalog";
import {
  publicProviders,
  credential,
  saveCredential,
  providerConfig,
  saveConfig,
  getRoutes,
  setRoutes,
  getCapabilities,
  usage,
  audit,
} from "./providers/repository";
import { providerById, configSchema, providers } from "./providers/registry";
import { testConnection, symbolSearch } from "./providers/upstream";
import { defaultRoute, compatibleRoutes } from "./providers/routing";
import { evaluateAlerts } from "./alerts";
import { syncSeries } from "./data";
import type { Route } from "./types";
const routeSchema = z.object({
  providerId: z.string(),
  providerSymbol: z.string().min(1).max(80),
  operation: z.enum(["quote", "bars", "observations"]),
  interval: z.string(),
  priority: z.number().int().min(0).max(100),
  enabled: z.boolean(),
  constraints: z.object({
    unit: z.string(),
    currency: z.string(),
    market: z.string(),
    priceDefinition: z.string(),
    frequency: z.string(),
  }),
  mode: z.enum(["auto", "fixed"]),
});
export function validateRoutes(id: string, routes: Route[]) {
  const s = seriesById(id);
  if (
    compatibleRoutes(
      s,
      routes.filter((r) => r.enabled),
    ).length !== routes.filter((r) => r.enabled).length
  )
    throw new AppError(
      "INVALID_UNIT",
      "备源品种、市场、货币、单位、频率与价格口径必须全部兼容",
    );
  for (const r of routes) {
    const p = providerById(r.providerId);
    if (
      !p.capabilities.operations.includes(r.operation) ||
      !p.capabilities.intervals.includes(r.interval)
    )
      throw new AppError("UNSUPPORTED_INTERVAL", "数据源未声明该操作/频率");
    const known = catalog.find(
      (c) =>
        c.providerId === r.providerId &&
        c.providerSymbol === r.providerSymbol &&
        c.unit === s.unit &&
        c.market === s.market &&
        c.priceDefinition === s.priceDefinition,
    );
    if (r.operation !== defaultRoute(s).operation)
      throw new AppError(
        "UNSUPPORTED_INTERVAL",
        "路由操作必须匹配标准指标类型",
      );
    if (!known || known.id !== s.id)
      throw new AppError(
        "INVALID_UNIT",
        "映射尚未验证，请先在 Catalog 新增对应供应商元数据",
      );
  }
  if (
    new Set(
      routes.map((r) => [r.providerId, r.operation, r.interval].join(":")),
    ).size !== routes.length
  )
    throw new AppError("VALIDATION_ERROR", "路由重复");
}
export async function providerApi(
  request: Request,
  p: string[],
  url: URL,
): Promise<Response | undefined> {
  const method = request.method;
  if (p[0] === "providers") {
    if (p[1] === "catalog" || p[1] === "configured" || p[1] === "health")
      return json({ items: await publicProviders() });
    if (p[1] === "export")
      return json({
        version: 1,
        providers: await Promise.all(
          providers.map(async (p) => ({
            id: p.id,
            ...(await providerConfig(p.id)),
          })),
        ),
        routes: await Promise.all(
          catalog.map(async (s) => ({
            seriesId: s.id,
            routes: await getRoutes(s.id),
          })),
        ),
      });
    if (p[1] === "import" && method === "POST") {
      const data = parse(
        z.object({
          providers: z
            .array(
              z.object({
                id: z.string(),
                enabled: z.boolean(),
                config: configSchema,
              }),
            )
            .max(30),
          routes: z
            .array(
              z.object({
                seriesId: z.string(),
                routes: z.array(routeSchema).max(10),
              }),
            )
            .max(100),
        }),
        await body(request),
      );
      for (const p of data.providers) {
        providerById(p.id);
        if (p.id === "alpha_vantage" && p.config.perDay > 25)
          throw new AppError(
            "VALIDATION_ERROR",
            "默认免费 Alpha Vantage 预算不能超过25次/日",
          );
      }
      for (const r of data.routes) validateRoutes(r.seriesId, r.routes);
      for (const p of data.providers)
        await saveConfig(p.id, p.enabled, p.config);
      for (const r of data.routes) await setRoutes(r.seriesId, r.routes);
      return json({
        status: "success",
        message: "已导入无密钥配置；凭据需在服务端另行配置",
      });
    }
    const id = p[1];
    if (!id) return undefined;
    const definition = providerById(id);
    if (p.length === 2 && method === "PATCH") {
      const data = parse(
        z.object({
          enabled: z.boolean().optional(),
          config: configSchema.partial().optional(),
        }),
        await body(request),
      );
      const old = await providerConfig(id);
      const config = { ...old.config, ...data.config };
      if (id === "alpha_vantage" && config.perDay > 25)
        throw new AppError(
          "VALIDATION_ERROR",
          "默认免费 Alpha Vantage 预算不能超过25次/日",
        );
      await saveConfig(id, data.enabled ?? old.enabled, config);
      return json({ status: "success" });
    }
    if (p[2] === "credentials" && ["POST", "DELETE"].includes(method)) {
      const data = parse(
        z.object({
          confirm: z.literal(true),
          apiKey: z.string().trim().min(8).max(512).optional(),
        }),
        await body(request),
      );
      if (method === "POST" && !data.apiKey)
        throw new AppError("VALIDATION_ERROR", "请输入 API Key");
      await saveCredential(id, method === "DELETE" ? null : data.apiKey!);
      return json({ status: "success" });
    }
    if (p[2] === "test-connection" && method === "POST")
      return json(await testConnection(id));
    if (p[2] === "capabilities" && method === "GET")
      return json({
        items: await getCapabilities(id),
        message: "仅列出实际探测结果；未探测不代表可用",
      });
    if (p[2] === "usage" && method === "GET") return json(await usage(id));
    if (p[2] === "search" && method === "GET") {
      const q = parse(
        z.string().trim().min(1).max(80),
        url.searchParams.get("q") ?? "",
      );
      if (id === "alpha_vantage")
        return json({
          items: await symbolSearch(id, q),
          message: "真实 SYMBOL_SEARCH；搜索结果须单独验证账户行情权限。",
        });
      const items = catalog
        .filter(
          (s) =>
            s.providerId === id &&
            [s.id, s.nameZh, s.providerSymbol]
              .join(" ")
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .map((s) => ({
          providerId: id,
          symbol: s.providerSymbol,
          name: s.nameZh,
          market: s.market,
          assetClass: s.category,
          unit: s.unit,
          currency: s.currency,
          priceDefinition: s.priceDefinition,
          operations: definition.capabilities.operations,
          intervals: [s.frequency],
        }));
      return json({
        items,
        message: "本地已核实 Catalog 映射（非全市场搜索）",
      });
    }
    if (p[2] === "sync" && method === "POST") {
      const data = parse(
        z.object({ seriesId: z.string().optional() }),
        await body(request),
      );
      const s = data.seriesId
        ? seriesById(data.seriesId)
        : (catalog.find((s) => s.providerId === id && s.kind !== "quote") ??
          catalog.find((s) => s.providerId === id));
      if (!s || s.providerId !== id)
        throw new AppError("INVALID_SERIES", "请选择该数据源的已注册指标");
      await audit("provider.sync", s.id);
      const result = await syncSeries(s.id);
      await evaluateAlerts(s.id);
      return json(result);
    }
    if (method === "GET" && p.length === 2) {
      const { key, ...safe } = await credential(id);
      void key;
      return json({
        ...definition,
        ...(await providerConfig(id)),
        credential: safe,
      });
    }
  }
  if (p[0] === "series" && p[2] === "routes") {
    const id = p[1];
    seriesById(id);
    if (method === "GET")
      return json({
        items: await getRoutes(id),
        reason:
          "先验证品种/市场/单位/频率/价格口径；按 priority 升序，固定模式只请求主源。历史按来源隔离，不拼接口径。",
      });
    if (method === "PUT") {
      const data = parse(
        z.object({ routes: z.array(routeSchema).min(1).max(10) }),
        await body(request),
      );
      validateRoutes(id, data.routes);
      await setRoutes(id, data.routes);
      return json({ items: data.routes });
    }
  }
  return undefined;
}
