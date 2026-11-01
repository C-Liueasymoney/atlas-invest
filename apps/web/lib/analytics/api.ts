import { z } from "zod";
import {
  body,
  json,
  parse,
  dateString as sharedDateString,
} from "../api-helpers";
import { seriesById } from "../catalog";
import { AppError } from "../errors";
import {
  availability,
  correlation,
  rollingAnalysis,
  refreshAssets,
} from "./service";
const dateString = sharedDateString.refine(
  (s) => new Date(s).toISOString().slice(0, 10) === s,
  "日期无效",
);
export async function analyticsApi(request: Request, p: string[], url: URL) {
  if (p[0] !== "analytics") return;
  if (p[1] === "assets" && p[2] === "availability" && request.method === "GET")
    return json(await availability());
  if (p[1] === "refresh" && request.method === "POST") {
    const d = parse(
      z.object({
        assets: z.array(z.string()).min(1).max(10),
        from: dateString.optional(),
        to: dateString.optional(),
      }),
      await body(request),
    );
    if (
      (d.from && !d.to) ||
      (!d.from && d.to) ||
      (d.from &&
        d.to &&
        (d.from > d.to ||
          d.to > new Date().toISOString().slice(0, 10) ||
          Date.parse(d.to) - Date.parse(d.from) > 11 * 366 * 86400000))
    )
      throw new AppError("VALIDATION_ERROR", "回填日期无效或超过11年");
    return json(
      await refreshAssets(
        d.assets,
        d.from && d.to ? { from: d.from, to: d.to } : undefined,
      ),
    );
  }
  if (p[1] !== "correlation" || request.method !== "GET") return;
  const assets = parse(
    z.array(z.string()).min(2).max(10),
    (url.searchParams.get("assets") || "SGE_AU9999_D1,FRED_NASDAQ100").split(
      ",",
    ),
  );
  assets.forEach(seriesById);
  if (new Set(assets).size !== assets.length)
    throw new AppError("VALIDATION_ERROR", "资产不能重复");
  const today = new Date().toISOString().slice(0, 10);
  const from = parse(
      dateString,
      url.searchParams.get("from") ||
        new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
    ),
    to = parse(dateString, url.searchParams.get("to") || today);
  if (from > to || to > today)
    throw new AppError("VALIDATION_ERROR", "日期区间无效或包含未来日期");
  if (Date.parse(to) - Date.parse(from) > 11 * 366 * 86400000)
    throw new AppError("VALIDATION_ERROR", "单次分析最多11年");
  const input = {
    assets,
    from,
    to,
    frequency: parse(
      z.enum(["daily", "weekly", "monthly"]),
      url.searchParams.get("frequency") || "daily",
    ),
    currency: parse(
      z.enum(["CNY", "USD"]),
      url.searchParams.get("currency") || "CNY",
    ),
  };
  if (p[2] === "rolling") {
    const a = url.searchParams.get("a") || assets[0],
      b = url.searchParams.get("b") || assets[1];
    if (!assets.includes(a) || !assets.includes(b))
      throw new AppError("VALIDATION_ERROR", "资产对必须属于分析资产");
    const window = parse(
      z.coerce.number().refine((n) => [30, 60, 120, 252].includes(n)),
      url.searchParams.get("window") || 60,
    );
    return json(await rollingAnalysis(input, a, b, window));
  }
  return json(await correlation(input));
}
