import { expect, it } from "vitest";
import {
  ProviderController,
  MemoryControllerStore,
} from "@/lib/providers/controller";
it("manual refresh bypasses a cached quote while still using the provider budget", async () => {
  const c = new ProviderController(new MemoryControllerStore());
  const budget = { ttlSeconds: 300, perMinute: 2, perHour: 100, perDay: 100 };
  let price = 854.76;
  const load = async () => ({ value: price });
  expect(await c.execute("gold", "quote", budget, load)).toBe(854.76);
  price = 833;
  expect(await c.execute("gold", "quote", budget, load, true)).toBe(833);
  await expect(
    c.execute("gold", "quote", budget, load, true),
  ).rejects.toThrow();
});
