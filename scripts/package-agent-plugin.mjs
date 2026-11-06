import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const url = new URL(process.env.ATLAS_AGENT_PUBLIC_URL || "");
if (
  url.protocol !== "https:" ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
)
  throw new Error(
    "Set ATLAS_AGENT_PUBLIC_URL to the deployed canonical HTTPS origin",
  );
const out = new URL("../.atlas/atlas-invest-plugin/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(
  new URL("plugin.json", out),
  await readFile(
    new URL("../plugins/atlas-invest/plugin.json", import.meta.url),
  ),
  { mode: 0o600 },
);
await writeFile(
  new URL("mcp.json", out),
  JSON.stringify(
    {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        "atlas-invest": {
          type: "streamable-http",
          url: new URL("/mcp", url).href,
          extensions: {
            "com.openai": {
              auth: {
                type: "oauth",
                baseScopes: [
                  "research:read",
                  "research:submit",
                  "offline_access",
                ],
              },
            },
          },
        },
      },
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(`Private plugin package: ${fileURLToPath(out)}`);
console.log(
  "For ChatGPT Work/mobile, add the deployed /mcp URL as a personal OAuth MCP plugin in ChatGPT Plugins. Local package availability differs by client.",
);
