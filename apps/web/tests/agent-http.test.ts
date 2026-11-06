import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { createAgentApp } from "../lib/agent/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHolding, createTask } from "../lib/investment/service";
let server: Server, base: string, dir: string;
const publicUrl = new URL("http://127.0.0.1:3001");
const password = "test-owner-password-123";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-agent-http-"));
  process.env.DATA_MODE = "demo";
  process.env.ATLAS_OAUTH_STATE_PATH = join(dir, "oauth.json");
  process.env.ATLAS_INVESTMENT_PATH = join(dir, "investment.json");
  process.env.OWNER_PASSWORD = password;
  const { app } = createAgentApp(publicUrl);
  server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", (error) =>
      error ? reject(error) : resolve(s),
    );
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  await rm(dir, { recursive: true, force: true });
  delete process.env.ATLAS_OAUTH_STATE_PATH;
  delete process.env.ATLAS_INVESTMENT_PATH;
  delete process.env.OWNER_PASSWORD;
});
const post = (
  path: string,
  data: Record<string, string>,
  headers: Record<string, string> = {},
) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(data),
    redirect: "manual",
  });
async function login(scope = "research:read research:submit offline_access") {
  const c = await (
    await fetch(base + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Test client",
        redirect_uris: ["https://chatgpt.com/callback"],
        token_endpoint_auth_method: "none",
      }),
    })
  ).json();
  const verifier = "a".repeat(64),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: c.client_id,
    response_type: "code",
    redirect_uri: c.redirect_uris[0],
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope,
    resource: publicUrl.href + "mcp",
    state: "state",
  });
  const auth = await fetch(base + "/authorize?" + params, {
    redirect: "manual",
  });
  expect(auth.status).toBe(302);
  const target = new URL(auth.headers.get("location")!);
  const request = target.searchParams.get("request")!,
    cookie = auth.headers.get("set-cookie")!.split(";")[0];
  const bad = await post(
    "/agent/consent",
    { request, password },
    { cookie, origin: "https://evil.example" },
  );
  expect(bad.status).toBe(403);
  const consent = await post(
    "/agent/consent",
    { request, password },
    { cookie, origin: publicUrl.origin },
  );
  expect(consent.status).toBe(302);
  const code = new URL(consent.headers.get("location")!).searchParams.get(
    "code",
  )!;
  const fields = {
    grant_type: "authorization_code",
    client_id: c.client_id,
    code,
    code_verifier: verifier,
    redirect_uri: c.redirect_uris[0],
    resource: publicUrl.href + "mcp",
  };
  const wrong = await post("/token", { ...fields, code_verifier: "wrong" });
  expect(wrong.status).toBe(400);
  const response = await post("/token", fields);
  expect(response.status).toBe(200);
  return response.json();
}
describe("HTTP OAuth and official SDK MCP client", () => {
  it("advertises protected metadata and requires authorization", async () => {
    expect(
      (
        await fetch(base + "/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    const preflight = await fetch(base + "/mcp", {
      method: "OPTIONS",
      headers: {
        Origin: "https://chatgpt.com",
        "Access-Control-Request-Headers": "authorization,content-type",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const meta = await (
      await fetch(base + "/.well-known/oauth-authorization-server")
    ).json();
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.authorization_response_iss_parameter_supported).toBe(true);
    const resource = await (
      await fetch(base + "/.well-known/oauth-protected-resource/mcp")
    ).json();
    expect(resource.resource).toBe(publicUrl.href + "mcp");
  });
  it("completes PKCE, lists tools, reads a task and writes and confirms a result", async () => {
    const token = await login();
    const client = new Client({ name: "acceptance-client", version: "1.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: {
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
      }),
    );
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
        "get_research_task",
        "submit_research_result",
        "get_research_task_status",
      ]);
      const h = await createHolding({
        name: "测试资产",
        code: null,
        market: null,
        identityStatus: "unconfirmed",
        assetClass: "stock",
        currency: "USD",
        exposureCurrency: null,
        sizing: "percent",
        amount: 10,
        valuationDate: "2026-11-06",
        source: "验收数据",
        investmentScope: "不代表用户持仓",
      });
      const task = await createTask({
        kind: "holding_analysis",
        holdingIds: [h.id],
        from: "2026-11-01",
        to: "2026-11-06",
      });
      const detail = await client.callTool({
        name: "get_research_task",
        arguments: { taskId: task.id },
      });
      expect(detail.isError).not.toBe(true);
      const result = {
        kind: "holding_analysis",
        asOf: "2026-11-06T00:00:00Z",
        summary: "验收分析：没有外部检索，不能推断涨跌原因",
        facts: Array.from({ length: 30 }, (_, i) => ({
          id: `fact-${i}`,
          text: "技术验收".repeat(900),
          sourceIds: ["source"],
        })),
        mechanisms: [],
        events: [],
        observations: [],
        review: null,
        sources: [
          {
            id: "source",
            url: "https://example.com/acceptance",
            title: "技术验收占位来源",
            publisher: "Test",
            publishedAt: null,
            retrievedAt: "2026-11-06T00:00:00Z",
            coverage: "仅用于测试，不代表市场信息",
            access: "full",
          },
        ],
        limitations: ["仅用于技术验收，未执行市场研究"],
        generation: "external_ai",
      };
      const write = await client.callTool({
        name: "submit_research_result",
        arguments: {
          taskId: task.id,
          contextVersion: task.contextVersion,
          schemaVersion: 1,
          idempotencyKey: "test-once",
          result,
        },
      });
      expect(write.isError).not.toBe(true);
      const status = await client.callTool({
        name: "get_research_task_status",
        arguments: { taskId: task.id },
      });
      expect(JSON.stringify(status.content)).toContain("completed");
      expect(JSON.stringify(status.content)).toContain("resultUrl");
    } finally {
      await client.close();
    }
  });
  it("read-only grants cannot submit or see the write tool", async () => {
    const token = await login("research:read");
    const client = new Client({ name: "read-client", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: {
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
      }),
    );
    try {
      expect((await client.listTools()).tools).toHaveLength(2);
      const r = await client.callTool({
        name: "submit_research_result",
        arguments: {},
      });
      expect(r.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
