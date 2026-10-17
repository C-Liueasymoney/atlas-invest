import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
const pg = new EmbeddedPostgres({
  databaseDir: "/tmp/atlas-invest-postgres-test",
  user: "atlas",
  password: "atlas-test-local",
  port: 55432,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1", "-k", "/tmp"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync("/tmp/atlas-invest-postgres-test/PG_VERSION"))
  await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("atlas_test");
} catch {}
console.log(
  "PostgreSQL integration server ready on 127.0.0.1:55432/atlas_test",
);
process.on("SIGINT", async () => {
  await pg.stop();
  process.exit();
});
process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit();
});
