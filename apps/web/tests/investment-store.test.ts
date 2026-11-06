import { it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
const exec = promisify(execFile);
it("migrates the owner JSONB store idempotently", async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(
      "../../db/migrations/0005_investment_workspace.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.query("INSERT INTO investment_workspaces(owner_id) VALUES($1)", [
      "00000000-0000-4000-8000-000000000001",
    ]);
    const { rows } = await db.query<{ state: { tasks: unknown[] } }>(
      "SELECT state FROM investment_workspaces",
    );
    expect(rows[0].state.tasks).toEqual([]);
  } finally {
    await db.close();
  }
});
it("serializes separate demo processes without lost updates and persists across reloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-investment-process-"));
  const path = join(directory, "state.json");
  try {
    const script = `import { investmentStore } from './lib/investment/store.ts'; await investmentStore(s=>{s.tasks.push({id:process.argv[1]})},true);`;
    const run = (id: string) =>
      exec(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script, id],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATA_MODE: "demo",
            ATLAS_INVESTMENT_PATH: path,
          },
        },
      );
    await Promise.all([run("first"), run("second"), run("third")]);
    const state = JSON.parse(await readFile(path, "utf8"));
    expect(state.tasks.map((t: { id: string }) => t.id).sort()).toEqual([
      "first",
      "second",
      "third",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it.runIf(!!process.env.TEST_DATABASE_URL)(
  "locks PostgreSQL across independent services and isolates another owner",
  async () => {
    const { default: postgres } = await import("postgres");
    const admin = postgres(process.env.TEST_DATABASE_URL!, {
      max: 1,
      onnotice: () => {},
    });
    const schema = "investment_" + crypto.randomUUID().replaceAll("-", "");
    await admin.unsafe("CREATE SCHEMA " + schema);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", "-csearch_path=" + schema);
    const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await db.unsafe(
        await readFile("../../db/migrations/0001_initial.sql", "utf8"),
      );
      await db.unsafe(
        await readFile(
          "../../db/migrations/0005_investment_workspace.sql",
          "utf8",
        ),
      );
      await db`INSERT INTO investment_workspaces(owner_id) VALUES('00000000-0000-4000-8000-000000000099')`;
      const script = `import { createHolding } from './lib/investment/service.ts'; await createHolding({name:process.argv[1],code:null,market:null,identityStatus:'unconfirmed',assetClass:'fund',currency:'CNY',exposureCurrency:null,sizing:'value',amount:100,valuationDate:'2026-11-06',source:'manual',investmentScope:'unknown'});process.exit(0);`;
      const run = (id: string) =>
        exec(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", script, id],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              DATA_MODE: "live",
              DATABASE_URL: url.toString(),
            },
          },
        );
      await Promise.all([run("one"), run("two"), run("three")]);
      const rows =
        await db`SELECT state FROM investment_workspaces WHERE owner_id='00000000-0000-4000-8000-000000000001'`;
      expect(rows[0].state.holdings).toHaveLength(3);
      const other =
        await db`SELECT state FROM investment_workspaces WHERE owner_id='00000000-0000-4000-8000-000000000099'`;
      expect(other[0].state.holdings).toHaveLength(0);
      const runCode = (script: string, args: string[] = []) =>
        exec(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", script, ...args],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              DATA_MODE: "live",
              DATABASE_URL: url.toString(),
            },
          },
        );
      const setup = await runCode(
        `import {createTask} from './lib/investment/service.ts'; const task=await createTask({kind:'holding_analysis',holdingIds:[process.argv[1]],from:'2026-10-07',to:'2026-11-06'});console.log(JSON.stringify(task));process.exit(0);`,
        [rows[0].state.holdings[0].id],
      );
      const task = JSON.parse(setup.stdout);
      const payload = {
        taskId: task.id,
        schemaVersion: 1,
        contextVersion: task.contextVersion,
        idempotencyKey: "pg-concurrent",
        result: {
          kind: "holding_analysis",
          asOf: "2026-11-06T00:00:00Z",
          summary: "No disclosure available",
          facts: [],
          mechanisms: [],
          events: [],
          observations: [],
          review: null,
          sources: [],
          limitations: ["Unavailable disclosure"],
          generation: "external_ai",
        },
      };
      const submitCode = `import {submitResult} from './lib/investment/service.ts'; try {console.log(JSON.stringify(await submitResult(JSON.parse(process.argv[1]))));process.exit(0);} catch(e){console.log(JSON.stringify({status:e.status}));process.exit(0);}`;
      const receipts = await Promise.all([
        runCode(submitCode, [JSON.stringify(payload)]),
        runCode(submitCode, [JSON.stringify(payload)]),
      ]);
      expect(JSON.parse(receipts[0].stdout).resultId).toBe(
        JSON.parse(receipts[1].stdout).resultId,
      );
      const conflict = await runCode(submitCode, [
        JSON.stringify({
          ...payload,
          result: { ...payload.result, summary: "Different" },
        }),
      ]);
      expect(JSON.parse(conflict.stdout).status).toBe(409);
      const persisted =
        await db`SELECT state FROM investment_workspaces WHERE owner_id='00000000-0000-4000-8000-000000000001'`;
      expect(persisted[0].state.results).toHaveLength(1);
      expect(persisted[0].state.tasks[0].state).toBe("completed");
      const audit = await db`SELECT action,resource_id FROM audit_logs`;
      expect(audit.length).toBeGreaterThan(0);
      expect(
        audit.every(
          (row) =>
            row.action === "investment.write" &&
            row.resource_id === "00000000-0000-4000-8000-000000000001",
        ),
      ).toBe(true);
    } finally {
      await db.end();
      await admin.unsafe("DROP SCHEMA " + schema + " CASCADE");
      await admin.end();
    }
  },
);
