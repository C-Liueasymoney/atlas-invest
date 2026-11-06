import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { AtlasOAuthProvider, digest, secret } from "../lib/agent/oauth";
import { oauthState } from "../lib/agent/oauth-store";
import type { Response } from "express";
let dir: string;
const issuer = new URL("https://atlas.example/");
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-oauth-"));
  process.env.DATA_MODE = "demo";
  process.env.ATLAS_OAUTH_STATE_PATH = join(dir, "oauth.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.ATLAS_OAUTH_STATE_PATH;
});
async function grant(
  p: AtlasOAuthProvider,
  scope = ["research:read", "research:submit", "offline_access"],
) {
  const client = await p.clientsStore.registerClient({
    redirect_uris: ["https://chatgpt.com/callback"],
    token_endpoint_auth_method: "none",
  });
  const verifier = secret(),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  let cookie = "",
    target = "";
  await p.authorize(
    client,
    {
      redirectUri: client.redirect_uris[0],
      resource: new URL(p.resource),
      scopes: scope,
      codeChallenge: challenge,
      state: "test-state",
    },
    {
      cookie: (_name: string, value: string) => {
        cookie = value;
      },
      redirect: (url: string) => {
        target = url;
      },
    } as unknown as Response,
  );
  const request = new URL(target).searchParams.get("request")!;
  const callback = new URL(await p.consent(request, cookie));
  return {
    client,
    code: callback.searchParams.get("code")!,
    verifier,
    challenge,
    request,
    cookie,
    callback,
  };
}
describe("Atlas owner OAuth provider", () => {
  it("persists clients, PKCE-bound one-time codes, tokens across provider restart and rotates refresh", async () => {
    const p = new AtlasOAuthProvider(issuer),
      g = await grant(p);
    expect(g.callback.searchParams.get("state")).toBe("test-state");
    expect(g.callback.searchParams.get("iss")).toBe(issuer.href);
    const restarted = new AtlasOAuthProvider(issuer);
    expect(
      (await restarted.clientsStore.getClient(g.client.client_id))
        ?.redirect_uris,
    ).toEqual(g.client.redirect_uris);
    expect(
      await restarted.challengeForAuthorizationCode(g.client, g.code),
    ).toBe(g.challenge);
    const t = await restarted.exchangeAuthorizationCode(
      g.client,
      g.code,
      undefined,
      g.client.redirect_uris[0],
      new URL(p.resource),
    );
    expect((await p.verifyAccessToken(t.access_token)).scopes).toContain(
      "research:submit",
    );
    await expect(
      p.exchangeAuthorizationCode(
        g.client,
        g.code,
        undefined,
        g.client.redirect_uris[0],
        new URL(p.resource),
      ),
    ).rejects.toThrow();
    const next = await p.exchangeRefreshToken(
      g.client,
      t.refresh_token!,
      undefined,
      new URL(p.resource),
    );
    await expect(
      p.exchangeRefreshToken(
        g.client,
        t.refresh_token!,
        undefined,
        new URL(p.resource),
      ),
    ).rejects.toThrow();
    await expect(p.verifyAccessToken(next.access_token)).rejects.toThrow();
    await p.revokeToken(g.client, { token: next.access_token });
    await expect(p.verifyAccessToken(next.access_token)).rejects.toThrow();
    await expect(p.verifyAccessToken(t.access_token)).rejects.toThrow();
  });
  it("rejects wrong client, redirect, audience and scope expansion without consuming a valid code", async () => {
    const p = new AtlasOAuthProvider(issuer),
      g = await grant(p, ["research:read", "offline_access"]);
    const other = await p.clientsStore.registerClient({
      redirect_uris: ["https://other.example/callback"],
    });
    await expect(
      p.challengeForAuthorizationCode(other, g.code),
    ).rejects.toThrow();
    await expect(
      p.exchangeAuthorizationCode(
        other,
        g.code,
        undefined,
        g.client.redirect_uris[0],
        new URL(p.resource),
      ),
    ).rejects.toThrow();
    await expect(
      p.exchangeAuthorizationCode(
        g.client,
        g.code,
        undefined,
        "https://evil.example",
        new URL(p.resource),
      ),
    ).rejects.toThrow();
    await expect(
      p.exchangeAuthorizationCode(
        g.client,
        g.code,
        undefined,
        g.client.redirect_uris[0],
        new URL("https://evil.example/mcp"),
      ),
    ).rejects.toThrow();
    const t = await p.exchangeAuthorizationCode(
      g.client,
      g.code,
      undefined,
      g.client.redirect_uris[0],
      new URL(p.resource),
    );
    await expect(
      p.exchangeRefreshToken(
        g.client,
        t.refresh_token!,
        ["research:submit"],
        new URL(p.resource),
      ),
    ).rejects.toThrow();
    await expect(p.consent(g.request, g.cookie)).rejects.toThrow();
  });
  it("rejects expired grants, access tokens, insecure callbacks and consent CSRF", async () => {
    const p = new AtlasOAuthProvider(issuer);
    await expect(
      p.clientsStore.registerClient({
        redirect_uris: ["http://evil.example/callback"],
      }),
    ).rejects.toThrow();
    const g = await grant(p);
    await oauthState((s) => {
      s.codes[digest(g.code)].expires = 0;
    });
    await expect(
      p.challengeForAuthorizationCode(g.client, g.code),
    ).rejects.toThrow();
    await expect(p.consent(g.request, "wrong-cookie")).rejects.toThrow();
    const h = await grant(p),
      t = await p.exchangeAuthorizationCode(
        h.client,
        h.code,
        undefined,
        h.client.redirect_uris[0],
        new URL(p.resource),
      );
    await oauthState((s) => {
      s.access[digest(t.access_token)].expires = 0;
    });
    await expect(p.verifyAccessToken(t.access_token)).rejects.toThrow();
  });
  it("recovers registration capacity from unconsented clients", async () => {
    const p = new AtlasOAuthProvider(issuer);
    await oauthState((s) => {
      for (let i = 0; i < 200; i++)
        s.clients[String(i)] = {
          client_id: String(i),
          client_id_issued_at: 1,
          redirect_uris: ["https://example.com/callback"],
        };
    });
    await oauthState((s) => {
      for (let i = 0; i < 200; i++)
        s.pending[String(i)] = {
          clientId: String(i),
          scopes: ["research:read"],
          resource: p.resource,
          expires: Date.now() + 600000,
        };
    });
    const client = await p.clientsStore.registerClient({
      redirect_uris: ["https://new.example/callback"],
    });
    expect((await p.clientsStore.getClient(client.client_id))?.client_id).toBe(
      client.client_id,
    );
  });
  it("accepts native loopback port changes but binds exchange to the actual redirect", async () => {
    const p = new AtlasOAuthProvider(issuer);
    const client = await p.clientsStore.registerClient({
      redirect_uris: ["http://127.0.0.1:3000/callback"],
    });
    let cookie = "",
      target = "";
    await p.authorize(
      client,
      {
        redirectUri: "http://127.0.0.1:4000/callback",
        resource: new URL(p.resource),
        scopes: ["research:read"],
        codeChallenge: "challenge",
      },
      {
        cookie: (_n: string, v: string) => {
          cookie = v;
        },
        redirect: (v: string) => {
          target = v;
        },
      } as unknown as Response,
    );
    const request = new URL(target).searchParams.get("request")!;
    const callback = new URL(await p.consent(request, cookie));
    await expect(
      p.exchangeAuthorizationCode(
        client,
        callback.searchParams.get("code")!,
        undefined,
        client.redirect_uris[0],
        new URL(p.resource),
      ),
    ).rejects.toThrow();
    expect(
      (
        await p.exchangeAuthorizationCode(
          client,
          callback.searchParams.get("code")!,
          undefined,
          "http://127.0.0.1:4000/callback",
          new URL(p.resource),
        )
      ).access_token,
    ).toBeTruthy();
  });
});
