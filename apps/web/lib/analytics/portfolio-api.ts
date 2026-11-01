import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { OWNER_ID } from "../auth/session";
import { demoMode, database, query } from "../db/client";
import { body, json, parse } from "../api-helpers";
import { AppError } from "../errors";
import { scenario, validatePortfolio, type SavedPortfolio } from "./portfolio";

type Row = {
  id: string;
  name: string;
  config: SavedPortfolio;
  created_at: Date;
  updated_at: Date;
};
let queue: Promise<unknown> = Promise.resolve();
async function storage<T>(
  operation: (items: SavedPortfolio[]) => {
    result: T;
    write?: SavedPortfolio;
    remove?: string;
  },
): Promise<T> {
  if (!demoMode()) {
    const rows = await query<Row>(
      "SELECT id,name,config,created_at,updated_at FROM analytics_portfolios WHERE owner_id=$1 ORDER BY updated_at DESC",
      [OWNER_ID],
    );
    const items = rows.map((row) => ({
      ...row.config,
      id: row.id,
      name: row.name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
    const job = operation(items);
    if (job.remove)
      await query(
        "DELETE FROM analytics_portfolios WHERE owner_id=$1 AND id=$2",
        [OWNER_ID, job.remove],
      );
    if (job.write) {
      const sql = database(),
        item = job.write;
      await sql`INSERT INTO analytics_portfolios(id,owner_id,name,config,created_at,updated_at) VALUES(${item.id},${OWNER_ID},${item.name},${sql.json(JSON.parse(JSON.stringify(item)))},${item.createdAt},${item.updatedAt}) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,config=EXCLUDED.config,updated_at=EXCLUDED.updated_at WHERE analytics_portfolios.owner_id=${OWNER_ID}`;
    }
    return job.result;
  }
  const path =
    process.env.ATLAS_PORTFOLIOS_PATH ||
    resolve(
      process.env.ATLAS_PROJECT_ROOT || process.cwd(),
      ".atlas",
      process.env.DATA_MODE === "preview"
        ? "portfolios-preview.json"
        : "portfolios-demo.json",
    );
  const task = queue.then(async () => {
    let items: SavedPortfolio[] = [];
    try {
      items = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const job = operation(items);
    if (job.write || job.remove) {
      items = items.filter(
        (x) => x.id !== job.remove && x.id !== job.write?.id,
      );
      if (job.write) items.unshift(job.write);
      await mkdir(dirname(path), { recursive: true });
      const temporary = path + "." + randomUUID() + ".tmp";
      await writeFile(temporary, JSON.stringify(items), { mode: 0o600 });
      await rename(temporary, path);
    }
    return job.result;
  });
  queue = task.catch(() => {});
  return task;
}
const shockSchema = z.object({
  shocks: z.record(z.string(), z.number().finite()).default({}),
  fxShockPct: z.number().finite().optional(),
});
export async function portfolioApi(request: Request, p: string[], url: URL) {
  void url;
  if (p[0] !== "analytics") return;
  if (
    p[1] === "portfolio" &&
    p[2] === "scenario" &&
    request.method === "POST"
  ) {
    const d = parse(
      shockSchema.extend({ portfolio: z.unknown() }),
      await body(request),
    );
    return json(scenario(d.portfolio, d.shocks, d.fxShockPct));
  }
  if (p[1] !== "portfolios") return;
  const method = request.method,
    id = p[2],
    action = p[3];
  if (id) parse(z.uuid(), id);
  if (p.length > 4) throw new AppError("NOT_FOUND", "组合接口不存在", 404);
  const payload =
    method === "POST" || method === "PUT" || method === "PATCH"
      ? await body(request)
      : undefined;
  return storage((items) => {
    if (!id) {
      if (method === "GET") return { result: json({ items }) };
      if (method === "POST") {
        const config = validatePortfolio(payload),
          now = new Date().toISOString();
        const item = {
          ...config,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        return { result: json({ item }, 201), write: item };
      }
    } else {
      const item = items.find((x) => x.id === id);
      if (!item) throw new AppError("NOT_FOUND", "组合不存在", 404);
      if (action === "scenario" && method === "POST") {
        const d = parse(shockSchema, payload);
        return { result: json(scenario(item, d.shocks, d.fxShockPct)) };
      }
      if (
        ["history-risk", "historical-risk"].includes(action) &&
        ["GET", "POST"].includes(method)
      )
        return {
          result: json({
            status: "unavailable",
            reason:
              "历史组合风险尚未实现；后续仅使用完整共同日期、同日汇率和真实价格收益，不对缺失数据前填。",
            volatility: null,
            maxDrawdown: null,
            VaR: null,
            samples: 0,
          }),
        };
      if (action === "copy" && method === "POST") {
        const d = parse(
          z.object({ name: z.string().trim().min(1).max(80).optional() }),
          payload,
        );
        const now = new Date().toISOString(),
          copy = {
            ...item,
            id: randomUUID(),
            name: d.name || item.name.slice(0, 76) + " 副本",
            createdAt: now,
            updatedAt: now,
          };
        return { result: json({ item: copy }, 201), write: copy };
      }
      if (!action) {
        if (method === "GET") return { result: json({ item }) };
        if (method === "DELETE")
          return { result: json({ deleted: true, id }), remove: id };
        if (method === "PUT" || method === "PATCH") {
          const data =
            method === "PATCH"
              ? {
                  ...item,
                  ...parse(
                    z.object({ name: z.string().trim().min(1).max(80) }),
                    payload,
                  ),
                }
              : payload;
          const updated = {
            ...validatePortfolio(data),
            id,
            createdAt: item.createdAt,
            updatedAt: new Date().toISOString(),
          };
          return { result: json({ item: updated }), write: updated };
        }
      }
    }
    throw new AppError("VALIDATION_ERROR", "不支持的组合操作", 405);
  });
}
