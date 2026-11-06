import { oauthLoginReturnTo } from "./auth/return-to";
import { investmentApi } from "./investment/api";
import { inflationSummary } from "./inflation-summary";
import { portfolioApi } from "./analytics/portfolio-api";
import { analyticsApi } from "./analytics/api";
import { previewMode, refreshPreview } from "./market-preview";
import { latestDomesticGold } from "./latest-gold";
import { latestIndex } from "./latest-index";
import {
  authorize,
  assertRuntime,
  signSession,
  passwordMatches,
  isLocalDemo,
  assertSameOrigin,
} from "./auth/session";
import { body, parse, json, dateString } from "./api-helpers";
import { z } from "zod";
import { AppError, errorResponse } from "./errors";
import { catalog, seriesById } from "./catalog";
import { quote, seriesData, compare, stats, importsForSeries } from "./data";
import { researchApi } from "./api-research";
import { publicProviders, audit } from "./providers/repository";
import { providerApi } from "./api-providers";
import { evaluateAlerts } from "./alerts";
import { alertsApi } from "./api-alerts";
import { workspaceApi } from "./api-workspace";
import { relatedApi } from "./api-related";
const loginAttempts: number[] = [];
export async function dispatch(
  request: Request,
  _path?: string[],
): Promise<Response> {
  void _path;
  try {
    const url = new URL(request.url);
    const p = url.pathname
      .replace(/^\/api\//, "")
      .split("/")
      .filter(Boolean);
    const method = request.method;
    if (p[0] === "auth" && p[1] === "login" && method === "POST") {
      assertRuntime();
      assertSameOrigin(request);
      while (loginAttempts[0] < Date.now() - 900000) loginAttempts.shift();
      if (loginAttempts.length >= 10)
        throw new AppError(
          "SOURCE_RATE_LIMITED",
          "登录失败过多，请15分钟后重试",
          429,
        );
      const d = parse(
        z.object({
          password: z.string().max(512),
          returnTo: z.string().max(2048).optional(),
        }),
        await body(request),
      );
      if (!passwordMatches(d.password, process.env.OWNER_PASSWORD || "")) {
        loginAttempts.push(Date.now());
        throw new AppError("UNAUTHORIZED", "密码错误", 401);
      }
      const r = json({
        authenticated: true,
        returnTo: oauthLoginReturnTo(
          d.returnTo,
          process.env.ATLAS_AGENT_PUBLIC_URL,
        ),
      });
      r.headers.set(
        "Set-Cookie",
        `atlas_session=${signSession(process.env.SESSION_SECRET!)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
      return r;
    }
    if (p[0] === "auth" && p[1] === "logout" && method === "POST") {
      authorize(request);
      const r = json({ authenticated: false });
      r.headers.set(
        "Set-Cookie",
        "atlas_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return r;
    }
    if (p[0] === "v1") p.shift();
    if (p[0] === "session") {
      assertRuntime();
      let authenticated = false;
      try {
        authorize(request);
        authenticated = true;
      } catch {}
      return json({
        mode:
          process.env.DATA_MODE === "live"
            ? "live"
            : previewMode()
              ? "preview"
              : "demo",
        authenticated,
        timezone: process.env.APP_TIMEZONE || "Asia/Shanghai",
        localDemo: isLocalDemo(),
      });
    }
    authorize(request);
    const investment = await investmentApi(request, p);
    if (investment) return investment;
    const portfolio = await portfolioApi(request, p, url);
    if (portfolio) return portfolio;
    const analytics = await analyticsApi(request, p, url);
    if (analytics) return analytics;
    const related = await relatedApi(request, p);
    if (related) return related;
    if (
      p[0] === "market" &&
      p[1] === "index-quote" &&
      ["GET", "POST"].includes(method)
    )
      return json(
        await latestIndex(
          url.searchParams.get("seriesId") || "",
          method === "POST",
        ),
      );
    if (
      p[0] === "market" &&
      p[1] === "domestic-quote" &&
      ["GET", "POST"].includes(method)
    ) {
      const item = await latestDomesticGold(method === "POST");
      return json({ items: [item], message: item.message });
    }
    if (p[0] === "market" && p[1] === "refresh" && method === "POST")
      return json(await refreshPreview());
    const managed = await providerApi(request, p, url);
    if (managed) return managed;
    const alerts = await alertsApi(request, p);
    if (alerts) return alerts;
    const work = await workspaceApi(request, p);
    if (work) {
      if (method !== "GET")
        await audit("workspace." + method.toLowerCase(), url.pathname);
      return work;
    }
    const research = await researchApi(request, p, url);
    if (research) return research;
    if (method === "GET") {
      if (p[0] === "catalog") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase().slice(0, 100),
          category = url.searchParams.get("category");
        return json({
          items: catalog.filter(
            (s) =>
              (!category || s.category === category) &&
              [s.id, s.nameZh, s.providerSymbol, s.description]
                .join(" ")
                .toLowerCase()
                .includes(q),
          ),
        });
      }
      if (p[0] === "quotes") {
        const ids = (
          url.searchParams.get("seriesIds") ||
          "SGE_AU9999_D1,XAUUSD_QUOTE,FX_USDCNY_D1,FRED_DFII10,FRED_DGS10,FRED_DTWEXBGS"
        ).split(",");
        if (ids.length > 20)
          throw new AppError("VALIDATION_ERROR", "一次最多20项指标");
        const items = await Promise.all(
          ids.map(async (id) =>
            id === "SGE_AU9999_D1"
              ? latestDomesticGold()
              : ["FRED_NASDAQ100", "FRED_SP500"].includes(id)
                ? (await latestIndex(id)).items[0]
                : quote(id),
          ),
        );
        await evaluateAlerts();
        return json({ items });
      }
      if (p[0] === "providers" && p[1] === "health")
        return json({ items: await publicProviders() });
      const from = url.searchParams.has("from")
          ? parse(dateString, url.searchParams.get("from"))
          : undefined,
        to = url.searchParams.has("to")
          ? parse(dateString, url.searchParams.get("to"))
          : undefined;
      if (from && to && from > to)
        throw new AppError("VALIDATION_ERROR", "开始日期不能晚于结束日期");
      if (p[0] === "inflation" && p[1] && p[2] === "summary")
        return json(await inflationSummary(p[1], from, to));
      if (p[0] === "series" && p[1]) {
        const s = seriesById(p[1]);
        if (p[2] === "metadata") return json(s);
        if (p[2] === "imports")
          return json({ items: await importsForSeries(s.id) });
        if (p[2] === "stats") return json(await stats(s.id));
        if (["bars", "observations"].includes(p[2])) {
          if (
            p[2] === "bars" &&
            (s.kind !== "ohlc" ||
              (url.searchParams.get("interval") ?? "1d") !== "1d")
          )
            throw new AppError(
              "UNSUPPORTED_INTERVAL",
              "该指标没有所请求频率的 OHLC",
            );
          return json(await seriesData(s.id, from, to));
        }
      }
      if (p[0] === "compare") {
        const ids = (
          url.searchParams.get("seriesIds") || "SGE_AU9999_D1,FRED_DFII10"
        ).split(",");
        if (ids.length > 10)
          throw new AppError("VALIDATION_ERROR", "最多10个比较指标");
        return json(
          await compare(
            ids,
            parse(
              z.enum(["index100", "pct", "raw"]),
              url.searchParams.get("mode") ?? "index100",
            ),
            parse(
              z.enum(["intersection", "outer"]),
              url.searchParams.get("align") ?? "outer",
            ),
            from,
            to,
          ),
        );
      }
    }
    throw new AppError("NOT_FOUND", "接口不存在或操作尚未实现", 404);
  } catch (e) {
    return errorResponse(e);
  }
}
