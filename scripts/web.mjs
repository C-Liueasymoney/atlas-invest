import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const command = process.argv[2] || "dev";
if (command === "start") {
  if (process.env.LOCAL_DEV_NO_AUTH === "true") {
    console.error("生产环境禁止 LOCAL_DEV_NO_AUTH=true");
    process.exit(1);
  }
  if (
    (process.env.OWNER_PASSWORD?.length || 0) < 12 ||
    (process.env.SESSION_SECRET?.length || 0) < 32
  ) {
    console.error("生产环境需要至少12位 OWNER_PASSWORD 和32位 SESSION_SECRET");
    process.exit(1);
  }
}
const child = spawn(
  process.execPath,
  command === "start"
    ? [
        fileURLToPath(
          new URL(
            "../apps/web/.next/standalone/apps/web/server.js",
            import.meta.url,
          ),
        ),
      ]
    : [
        "../../node_modules/next/dist/bin/next",
        command,
        ...(command === "build"
          ? ["--webpack"]
          : ["--hostname", process.env.ATLAS_BIND_HOST || "127.0.0.1"]),
      ],
  {
    cwd: new URL("../apps/web/", import.meta.url),
    stdio: "inherit",
    env: {
      ...process.env,
      DATA_MODE:
        process.env.DATA_MODE || (command === "dev" ? "preview" : "live"),
      HOSTNAME: process.env.ATLAS_BIND_HOST || "127.0.0.1",
      ATLAS_PROJECT_ROOT: fileURLToPath(new URL("../", import.meta.url)),
      NODE_ENV: command === "dev" ? "development" : "production",
    },
  },
);
child.on("exit", async (code) => {
  if (command === "build" && code === 0) {
    try {
      await cp(
        new URL("../apps/web/.next/static", import.meta.url),
        new URL(
          "../apps/web/.next/standalone/apps/web/.next/static",
          import.meta.url,
        ),
        { recursive: true },
      );
      const publicDir = new URL("../apps/web/public", import.meta.url);
      if (existsSync(publicDir))
        await cp(
          publicDir,
          new URL(
            "../apps/web/.next/standalone/apps/web/public",
            import.meta.url,
          ),
          { recursive: true },
        );
    } catch {
      console.error("Standalone静态文件准备失败");
      process.exit(1);
    }
  }
  process.exit(code ?? 1);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
