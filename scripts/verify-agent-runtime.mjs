import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const probe = createServer();
await new Promise((resolve, reject) =>
  probe.listen(0, "127.0.0.1", (error) => (error ? reject(error) : resolve())),
);
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const dir = await mkdtemp(join(tmpdir(), "atlas-runtime-"));
const child = spawn(
  process.execPath,
  [resolve(process.env.ATLAS_RUNTIME_OUTPUT || ".atlas/runtime", "server.mjs")],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATA_MODE: "demo",
      OWNER_PASSWORD: "runtime-verification-only-password",
      SESSION_SECRET: "runtime-verification-session-secret-long-enough",
      ATLAS_AGENT_PUBLIC_URL: `http://127.0.0.1:${port}`,
      ATLAS_AGENT_PORT: String(port),
      ATLAS_OAUTH_STATE_PATH: join(dir, "oauth.json"),
      ATLAS_INVESTMENT_PATH: join(dir, "investment.json"),
    },
  },
);
let logs = "";
child.stdout.on("data", (b) => {
  logs += b;
});
child.stderr.on("data", (b) => {
  logs += b;
});
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/agent/health`);
      if (r.ok && (await r.json()).name === "atlas-invest") {
        ready = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await delay(100);
  }
  if (!ready) throw new Error(`Bundled runtime failed to start: ${logs}`);
  const metadata = await (
    await fetch(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`,
    )
  ).json();
  if (metadata.resource !== `http://127.0.0.1:${port}/mcp`)
    throw new Error("Wrong protected resource metadata");
  const denied = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (denied.status !== 401)
    throw new Error("Bundled runtime did not protect research tools");
  console.log(
    "Bundled Node runtime passed: starts, health, OAuth metadata, unauthenticated MCP rejected.",
  );
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null)
    await new Promise((resolve) => child.once("exit", resolve));
  await rm(dir, { recursive: true, force: true });
}
