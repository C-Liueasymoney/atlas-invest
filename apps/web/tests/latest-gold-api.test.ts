import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "@/lib/api";

it("refresh obtains a new source quote, preserves history and returns an explicit fallback on failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-latest-gold-"));
  const oldMode = process.env.DATA_MODE,
    oldPath = process.env.ATLAS_MARKET_CACHE_PATH;
  process.env.DATA_MODE = "preview";
  process.env.LOCAL_DEV_NO_AUTH = "true";
  process.env.ATLAS_MARKET_CACHE_PATH = join(dir, "market.json");
  const history = JSON.stringify({
    version: 1,
    series: {
      SGE_AU9999_D1: {
        seriesId: "SGE_AU9999_D1",
        providerId: "akshare_sge",
        status: "ok",
        fetchedAt: "2026-10-30T08:09:55Z",
        asOf: "2026-10-30",
        points: [{ time: "2026-10-30", value: "854.76" }],
      },
    },
  });
  await writeFile(process.env.ATLAS_MARKET_CACHE_PATH, history);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
  let value = "833.00",
    fail = false;
  vi.stubGlobal("fetch", async () => {
    if (fail) throw new Error("unavailable");
    return new Response(
      `<h1>上海黄金交易所2026年10月31日延时行情</h1><table><tr><td>Au99.99</td><td>${value}</td></tr></table>`,
    );
  });
  const call = () =>
    dispatch(
      new Request("http://localhost:3000/api/v1/market/domestic-quote", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
  try {
    expect((await (await call()).json()).items[0].value).toBe("833.00");
    value = "831.00";
    expect((await (await call()).json()).items[0].value).toBe("831.00");
    fail = true;
    const fallback = (await (await call()).json()).items[0];
    expect(fallback.value).toBe("831.00");
    expect(fallback.status).toBe("stale");
    expect(fallback.message).toContain("最新报价获取失败");
    const read = await dispatch(
      new Request("http://localhost:3000/api/v1/market/domestic-quote"),
    );
    expect((await read.json()).items[0].status).toBe("stale");
    expect(await readFile(process.env.ATLAS_MARKET_CACHE_PATH, "utf8")).toBe(
      history,
    );
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (oldMode === undefined) delete process.env.DATA_MODE;
    else process.env.DATA_MODE = oldMode;
    if (oldPath === undefined) delete process.env.ATLAS_MARKET_CACHE_PATH;
    else process.env.ATLAS_MARKET_CACHE_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
