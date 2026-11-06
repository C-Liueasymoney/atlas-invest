import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { database, demoMode } from "../db/client";
import { OWNER_ID } from "../auth/session";
import { AppError } from "../errors";
import { emptyState, type InvestmentState } from "./model";

// The database row lock coordinates Next and remote MCP processes. Demo files use
// an exclusive directory lock; a crashed process fails closed until lock cleanup.
export async function investmentStore<T>(
  operation: (state: InvestmentState) => T,
  mutate = false,
): Promise<T> {
  if (!demoMode()) {
    const db = database();
    const result = await db.begin(async (sql) => {
      await sql`INSERT INTO investment_workspaces(owner_id) VALUES(${OWNER_ID}) ON CONFLICT DO NOTHING`;
      const rows =
        await sql`SELECT state FROM investment_workspaces WHERE owner_id=${OWNER_ID} FOR UPDATE`;
      const state = rows[0].state as InvestmentState;
      const result = operation(state);
      if (mutate) {
        await sql`UPDATE investment_workspaces SET state=${sql.json(JSON.parse(JSON.stringify(state)))},updated_at=now() WHERE owner_id=${OWNER_ID}`;
        await sql`INSERT INTO audit_logs(id,owner_id,action,resource_id) VALUES(${randomUUID()},${OWNER_ID},'investment.write',${OWNER_ID})`;
      }
      return { value: result };
    });
    return result.value;
  }
  const path =
    process.env.ATLAS_INVESTMENT_PATH ||
    resolve(
      process.env.ATLAS_PROJECT_ROOT || process.cwd(),
      ".atlas",
      `investment-${process.env.DATA_MODE === "preview" ? "preview" : "demo"}.json`,
    );
  await mkdir(dirname(path), { recursive: true });
  const lock = path + ".lock";
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      await mkdir(lock, { mode: 0o700 });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (Date.now() > deadline)
        throw new AppError(
          "STORAGE_BUSY",
          "研究数据正在写入；请稍后重试。若进程异常退出，请由管理员清理锁目录。",
          503,
        );
      await sleep(15);
    }
  }
  try {
    let state: InvestmentState;
    try {
      state = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      state = emptyState();
    }
    const result = operation(state);
    if (mutate) {
      const temporary = path + "." + randomUUID() + ".tmp";
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(state));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
    }
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
