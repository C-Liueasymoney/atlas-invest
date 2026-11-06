import { expect, it } from "vitest";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { AtlasOAuthProvider } from "../lib/agent/oauth";
import { database } from "../lib/db/client";
it.runIf(!!process.env.TEST_DATABASE_URL)(
  "commits refresh replay revocation in a real PostgreSQL transaction",
  async () => {
    const schema = "oauth_" + randomUUID().replaceAll("-", "");
    const admin = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
    const before = {
      mode: process.env.DATA_MODE,
      url: process.env.DATABASE_URL,
    };
    try {
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      await admin.unsafe(`SET search_path TO ${schema}`);
      await admin.unsafe(
        await readFile("../../db/migrations/0006_agent_oauth.sql", "utf8"),
      );
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema}`);
      process.env.DATA_MODE = "live";
      process.env.DATABASE_URL = url.href;
      const p = new AtlasOAuthProvider(new URL("https://atlas.example/"));
      const client = await p.clientsStore.registerClient({
        redirect_uris: ["https://chatgpt.com/callback"],
        token_endpoint_auth_method: "none",
      });
      let cookie = "",
        target = "";
      await p.authorize(
        client,
        {
          redirectUri: client.redirect_uris[0],
          resource: new URL(p.resource),
          scopes: ["research:read", "offline_access"],
          codeChallenge: "test-challenge",
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
      const callback = new URL(
        await p.consent(new URL(target).searchParams.get("request")!, cookie),
      );
      const tokens = await p.exchangeAuthorizationCode(
        client,
        callback.searchParams.get("code")!,
        undefined,
        client.redirect_uris[0],
        new URL(p.resource),
      );
      const next = await p.exchangeRefreshToken(
        client,
        tokens.refresh_token!,
        undefined,
        new URL(p.resource),
      );
      expect((await p.verifyAccessToken(next.access_token)).clientId).toBe(
        client.client_id,
      );
      await expect(
        p.exchangeRefreshToken(
          client,
          tokens.refresh_token!,
          undefined,
          new URL(p.resource),
        ),
      ).rejects.toThrow();
      const reloaded = new AtlasOAuthProvider(
        new URL("https://atlas.example/"),
      );
      await expect(
        reloaded.verifyAccessToken(next.access_token),
      ).rejects.toThrow();
      await expect(
        reloaded.verifyAccessToken(tokens.access_token),
      ).rejects.toThrow();
    } finally {
      await database().end();
      process.env.DATA_MODE = before.mode;
      if (before.url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = before.url;
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
  20000,
);
