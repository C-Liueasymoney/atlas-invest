import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { researchApi } from "../lib/api-research";
let dir: string;
const req = (method: string, path: string, payload?: unknown) =>
  new Request("http://localhost/api/v1/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
async function call(method: string, path: string, payload?: unknown) {
  const request = req(method, path, payload);
  return researchApi(
    request,
    path.split("?")[0].split("/"),
    new URL(request.url),
  );
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-research-"));
  process.env.DATA_MODE = "demo";
  process.env.ATLAS_DEMO_STATE_PATH = join(dir, "state.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
describe("research API", () => {
  it("creates, edits and removes Markdown notes as inert text", async () => {
    const created = await (await call("POST", "research", {
      title: "黄金观察",
      markdown: "<script>alert(1)</script>",
      seriesIds: ["FRED_DFII10"],
    }))!.json();
    expect(created.markdown).toBe("<script>alert(1)</script>");
    const changed = await (await call("PATCH", "research/" + created.id, {
      title: "更新",
      tags: ["宏观"],
    }))!.json();
    expect(changed.title).toBe("更新");
    expect(changed.tags).toEqual(["宏观"]);
    expect((await (await call("GET", "research"))!.json()).items).toHaveLength(
      1,
    );
    await call("DELETE", "research/" + created.id);
    expect((await (await call("GET", "research"))!.json()).items).toHaveLength(
      0,
    );
  });
  it("rejects unknown series/date and requires explicit import confirmation", async () => {
    await expect(
      call("POST", "research", {
        title: "test",
        markdown: "text",
        seriesIds: ["UNKNOWN"],
      }),
    ).rejects.toThrow();
    await expect(
      call("POST", "research", {
        title: "test",
        markdown: "text",
        eventDate: "2026-02-30",
      }),
    ).rejects.toThrow();
    await expect(
      call("POST", "imports/commit", { token: "fake", confirm: true }),
    ).rejects.toThrow();
  });
  it("exports canonical demo envelope and labels every CSV row demo", async () => {
    const response = await call(
      "GET",
      "export?seriesId=FRED_DFII10&format=csv",
    );
    const content = await response!.text();
    expect(content).toContain("isDemo");
    expect(content).toContain("true");
    expect(content).toContain("demo");
  });
});
