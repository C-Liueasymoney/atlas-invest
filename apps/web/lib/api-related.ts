import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database, demoMode, query } from "./db/client";
import { OWNER_ID } from "./auth/session";
import { seriesById } from "./catalog";
import { body, json, parse } from "./api-helpers";
import { AppError } from "./errors";
import { relatedDefaults } from "./related-defaults";
let queue: Promise<unknown> = Promise.resolve();
export async function relatedApi(request: Request, p: string[]) {
  if (p[0] !== "market" || p[1] !== "related" || p.length !== 3) return;
  const id = p[2];
  seriesById(id);
  if (!["GET", "PUT"].includes(request.method))
    throw new AppError("VALIDATION_ERROR", "不支持的操作", 405);
  const recommended = (relatedDefaults[id] || []).filter((x) => x !== id);
  let items: string[] | undefined;
  if (request.method === "PUT") {
    items = parse(
      z.object({ items: z.array(z.string()).max(20) }),
      await body(request),
    ).items;
    items.forEach(seriesById);
    if (items.includes(id) || new Set(items).size !== items.length)
      throw new AppError("VALIDATION_ERROR", "不能关联自身或重复指标");
  }
  let saved: string[] | undefined;
  if (!demoMode()) {
    const sql = database();
    if (items)
      await sql`INSERT INTO market_related_preferences(owner_id,series_id,related_ids) VALUES(${OWNER_ID},${id},${sql.json(items)}) ON CONFLICT(owner_id,series_id) DO UPDATE SET related_ids=EXCLUDED.related_ids,updated_at=now()`;
    saved = (
      await query<{ related_ids: string[] }>(
        "SELECT related_ids FROM market_related_preferences WHERE owner_id=$1 AND series_id=$2",
        [OWNER_ID, id],
      )
    )[0]?.related_ids;
  } else {
    const path =
      process.env.ATLAS_OVERVIEW_PATH ||
      resolve(
        process.env.ATLAS_PROJECT_ROOT || process.cwd(),
        ".atlas",
        process.env.DATA_MODE === "preview"
          ? "overview-preview.json"
          : "overview-demo.json",
      );
    const job = queue.then(async () => {
      let state: Record<string, string[]> = {};
      try {
        state = JSON.parse(await readFile(path, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (items) {
        state[id] = items;
        await mkdir(dirname(path), { recursive: true });
        const tmp = path + "." + randomUUID() + ".tmp";
        await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
        await rename(tmp, path);
      }
      return state[id];
    });
    queue = job.catch(() => {});
    saved = await job;
  }
  return json({
    seriesId: id,
    items: saved ?? recommended,
    recommended,
    customized: saved !== undefined,
  });
}
