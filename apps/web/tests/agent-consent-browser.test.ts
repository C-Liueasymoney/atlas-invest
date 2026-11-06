import { expect, it } from "vitest";
import { chromium } from "@playwright/test";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createAgentApp } from "../lib/agent/server";
import { signSession } from "../lib/auth/session";

it("signed-in browser connects without another password and completes PKCE", async () => {
  const original = { ...process.env };
  const dir = await mkdtemp(join(tmpdir(), "atlas-consent-browser-"));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  process.env.DATA_MODE = "demo";
  process.env.OWNER_PASSWORD = "browser-consent-test-password";
  process.env.SESSION_SECRET = "browser-session-signing-secret-long-enough";
  process.env.ATLAS_OAUTH_STATE_PATH = join(dir, "oauth.json");
  const { app } = createAgentApp(new URL(base));
  const server = app.listen(port, "127.0.0.1");
  const browser = await chromium.launch();
  try {
    const registration = await fetch(base + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Browser regression",
        redirect_uris: [base + "/callback"],
        token_endpoint_auth_method: "none",
      }),
    });
    const client = await registration.json();
    const verifier = "b".repeat(64);
    const params = new URLSearchParams({
      client_id: client.client_id,
      response_type: "code",
      redirect_uri: base + "/callback",
      scope: "research:read research:submit offline_access",
      resource: base + "/mcp",
      state: "browser-regression",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "atlas_session",
        value: signSession(process.env.SESSION_SECRET),
        url: base,
      },
    ]);
    const page = await context.newPage();
    await page.goto(base + "/authorize?" + params);
    expect(await page.locator('input[type="password"]').count()).toBe(0);
    const submitted = page.waitForRequest(
      (r) => r.url() === base + "/agent/consent" && r.method() === "POST",
    );
    await page.getByRole("button", { name: "连接" }).click();
    const post = await submitted;
    expect(post.headers().origin).toBe(base);
    await page.waitForURL(base + "/callback?**", { timeout: 5000 });
    const callback = new URL(page.url());
    expect(callback.searchParams.get("state")).toBe("browser-regression");
    const response = await fetch(base + "/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: callback.searchParams.get("code")!,
        code_verifier: verifier,
        redirect_uri: base + "/callback",
        resource: base + "/mcp",
      }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).access_token).toBeTruthy();
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(base + "/authorize?" + params);
    expect(await guestPage.locator('input[type="password"]').count()).toBe(0);
    await guestPage.getByRole("button", { name: "连接", exact: true }).click();
    await guestPage.waitForURL(base + "/login?**");
    const back = new URL(new URL(guestPage.url()).searchParams.get("next")!);
    expect(back.origin).toBe(base);
    expect(back.pathname).toBe("/agent/consent");
    expect(back.searchParams.get("request")).toBeTruthy();
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(process.env))
      if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
