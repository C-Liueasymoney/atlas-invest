import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    fileURLToPath(new URL("../apps/web/lib/agent/start.ts", import.meta.url)),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ATLAS_PROJECT_ROOT: root,
      DATA_MODE: process.env.DATA_MODE || "preview",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
