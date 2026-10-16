import { spawn } from "node:child_process";
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
  [
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
      NODE_ENV: command === "dev" ? "development" : "production",
    },
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
