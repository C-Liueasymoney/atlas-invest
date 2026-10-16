import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  if (process.argv[2] === "migrate") {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`;
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (await sql`SELECT name FROM schema_migrations WHERE name=${name}`)
          .length
      )
        continue;
      const migration = await readFile(`db/migrations/${name}`, "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(migration);
        await tx`INSERT INTO schema_migrations(name) VALUES(${name})`;
      });
      console.log(`Applied ${name}`);
    }
  } else if (process.argv[2] === "seed") {
    for (const [id, name] of Object.entries({
      akshare_sge: "AKShare / SGE",
      gold_api: "Gold API",
      frankfurter: "Frankfurter",
      fred: "FRED",
      alpha_vantage: "Alpha Vantage",
      fmp: "FMP",
      yahoo: "Yahoo (disabled)",
      derived: "Derived",
      wgc_import: "WGC manual import",
      cftc: "CFTC",
    })) {
      await sql`INSERT INTO providers(id,name,enabled) VALUES(${id},${name},${!["yahoo", "fmp"].includes(id)}) ON CONFLICT(id) DO NOTHING`;
    }
    for (const s of JSON.parse(
      await readFile("config/indicators.json", "utf8"),
    )) {
      await sql`INSERT INTO series(id,provider_id,provider_series_id,name_zh,kind,frequency,unit,timezone,description,source_url,stale_policy,metadata) VALUES(${s.id},${s.providerId},${s.providerSymbol},${s.nameZh},${s.kind},${s.frequency},${s.unit},${s.timezone},${s.description},${s.sourceUrl},${sql.json({ staleSeconds: s.staleSeconds })},${sql.json(s)}) ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata`;
    }
    console.log("Seeded metadata only; no demo/live prices inserted.");
  }
} catch {
  console.error(
    "Database operation failed. Check DATABASE_URL, server availability, and migration privileges.",
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
