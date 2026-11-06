import { createAgentApp } from "./server";
const port = Number(process.env.ATLAS_AGENT_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid ATLAS_AGENT_PORT");
const { app } = createAgentApp();
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Atlas MCP listening on loopback:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
