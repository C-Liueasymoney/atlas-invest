import { it, expect } from "vitest";
import {
  ProviderController,
  MemoryControllerStore,
} from "@/lib/providers/controller";
import { AppError } from "@/lib/errors";
it("deduplicates requests, shares cache, respects a daily quota and never caches failure as price", async () => {
  let now = 1000,
    calls = 0;
  const store = new MemoryControllerStore();
  const c = new ProviderController(store, () => now);
  const budget = { ttlSeconds: 30, perMinute: 5, perHour: 10, perDay: 1 };
  const load = async () => {
    calls++;
    return { value: { price: "10" }, maxAgeSeconds: 45 };
  };
  const out = await Promise.all([
    c.execute("gold", "XAU", budget, load),
    c.execute("gold", "XAU", budget, load),
  ]);
  expect(out[0]).toEqual({ price: "10" });
  expect(calls).toBe(1);
  now += 31000;
  expect(await c.execute("gold", "XAU", budget, load)).toEqual({ price: "10" });
  expect(calls).toBe(1);
  now += 15000;
  await expect(c.execute("gold", "XAU", budget, load)).rejects.toMatchObject({
    code: "SOURCE_RATE_LIMITED",
  });
  expect(calls).toBe(1);
});
it("opens a short circuit after upstream 429 and retains cached last success", async () => {
  let calls = 0;
  const c = new ProviderController(new MemoryControllerStore(), () => 1000);
  const budget = { ttlSeconds: 30, perMinute: 5, perHour: 10, perDay: 20 };
  const load = async () => {
    calls++;
    throw new AppError("SOURCE_RATE_LIMITED", "上游限额", 429);
  };
  await expect(c.execute("fred", "x", budget, load)).rejects.toMatchObject({
    code: "SOURCE_RATE_LIMITED",
  });
  await expect(c.execute("fred", "x", budget, load)).rejects.toMatchObject({
    code: "SOURCE_RATE_LIMITED",
  });
  expect(calls).toBe(1);
});
