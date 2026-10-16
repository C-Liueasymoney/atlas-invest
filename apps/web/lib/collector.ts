import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "./errors";
import { seriesById } from "./catalog";
export async function collectorCommand(seriesId: string, probe = false) {
  const s = seriesById(seriesId);
  if (!["akshare_sge", "cftc"].includes(s.providerId))
    throw new AppError("UNSUPPORTED_INTERVAL", "此采集器命令未启用");
  const root =
      process.env.ATLAS_PROJECT_ROOT || resolve(process.cwd(), "../.."),
    local = resolve(root, "services/collector/.venv/bin/python");
  const python =
    process.env.COLLECTOR_PYTHON || (existsSync(local) ? local : "python3");
  const args = ["-m", "atlas_collector", "sync", "--series", seriesId];
  if (probe) {
    args.push(
      "--probe",
      "--start",
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    );
  }
  try {
    const { stdout } = await promisify(execFile)(python, args, {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: resolve(root, "services/collector/src"),
      },
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new AppError(
      "SOURCE_UNAVAILABLE",
      "Python采集器不可用或上游请求失败，请检查安装与采集日志；已有数据保留",
      503,
    );
  }
}
