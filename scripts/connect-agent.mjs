// Adds the remote server through the supported CLI; never edits credential files.
import { spawnSync } from "node:child_process";
const base = process.env.ATLAS_AGENT_PUBLIC_URL;
if (!base)
  throw new Error(
    "Set ATLAS_AGENT_PUBLIC_URL to the deployed HTTPS origin first",
  );
const url = new URL(base);
if (
  url.protocol !== "https:" ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
)
  throw new Error("Expected canonical HTTPS origin");
const health = await fetch(new URL("/agent/health", url), {
  signal: AbortSignal.timeout(10000),
});
if (!health.ok || (await health.json()).name !== "atlas-invest")
  throw new Error(
    "Atlas MCP health check failed; deploy the service before connecting",
  );
const run = (args) => {
  const result = spawnSync("codex", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run(["mcp", "add", "atlas-invest", "--url", new URL("/mcp", url).href]);
run([
  "mcp",
  "login",
  "atlas-invest",
  "--scopes",
  "research:read,research:submit,offline_access",
]);
console.log(
  "Atlas configured. Start a new Codex chat and use a copied research task.",
);
