import { z } from "zod";
import type { Point } from "./types";
export type ChinaCpiField = "NATIONAL_SAME" | "NATIONAL_SEQUENTIAL";
export function chinaCpiUrl(field: ChinaCpiField = "NATIONAL_SAME") {
  const url = new URL("https://datacenter-web.eastmoney.com/api/data/v1/get");
  url.search = new URLSearchParams({
    reportName: "RPT_ECONOMY_CPI",
    columns: `REPORT_DATE,${field}`,
    pageNumber: "1",
    pageSize: "2000",
    sortColumns: "REPORT_DATE",
    sortTypes: "1",
    source: "WEB",
    client: "WEB",
  }).toString();
  return url;
}
export function parseChinaCpi(
  raw: unknown,
  field: ChinaCpiField = "NATIONAL_SAME",
): Point[] {
  const payload = z
    .object({
      success: z.literal(true),
      result: z.object({
        pages: z.number().int().max(1).optional(),
        data: z.array(z.object({ REPORT_DATE: z.string() }).passthrough()),
      }),
    })
    .parse(raw);
  const points = new Map<string, string | null>();
  for (const row of payload.result.data) {
    const time = row.REPORT_DATE.slice(0, 10);
    if (
      !/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(time) ||
      time > new Date().toISOString().slice(0, 7) + "-01"
    )
      throw Error("Invalid CPI observation month");
    const parsed = z
      .union([
        z.number().finite(),
        z.string().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/),
      ])
      .nullable()
      .parse(row[field]);
    const value = parsed === null ? null : String(parsed);
    if (value !== null && !Number.isFinite(Number(value)))
      throw Error("Invalid CPI percentage");
    if (points.has(time) && points.get(time) !== value)
      throw Error("Conflicting CPI observations");
    points.set(time, value);
  }
  return [...points]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, value]) => ({ time, value }));
}
