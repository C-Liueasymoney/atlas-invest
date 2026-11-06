import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "@/lib/api";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-investment-api-"));
  vi.stubEnv("ATLAS_INVESTMENT_PATH", join(dir, "state.json"));
  vi.stubEnv("DATA_MODE", "demo");
  vi.stubEnv("LOCAL_DEV_NO_AUTH", "true");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
const call = (
  path: string,
  method = "GET",
  payload?: unknown,
  headers?: Record<string, string>,
) =>
  dispatch(
    new Request("http://localhost:3000/api/v1/investment" + path, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  );
it("requires owner authentication and protects browser writes against cross-site requests", async () => {
  vi.stubEnv("LOCAL_DEV_NO_AUTH", "false");
  expect((await call("")).status).toBe(401);
  vi.stubEnv("LOCAL_DEV_NO_AUTH", "true");
  expect(
    (await call("/holdings", "POST", {}, { origin: "https://evil.example" }))
      .status,
  ).toBe(403);
  expect(
    (await call("/restore", "POST", {}, { "sec-fetch-site": "cross-site" }))
      .status,
  ).toBe(403);
});
it("exposes an empty independent workspace and rejects malformed recovery payloads", async () => {
  const r = await call("");
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    holdings: [],
    decisions: [],
    tasks: [],
    results: [],
    agentUrl: null,
  });
  expect(
    (await call("/restore", "POST", { result: { summary: "claim" } })).status,
  ).toBe(400);
});
