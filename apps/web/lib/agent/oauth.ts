import { redirectUriMatches } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { oauthState, type OAuthState, type Grant } from "./oauth-store";
export const scopes = ["research:read", "research:submit", "offline_access"];
export const secret = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function prune(s: OAuthState) {
  for (const table of [s.pending, s.codes, s.access, s.refresh])
    for (const [key, g] of Object.entries(table))
      if (g.expires <= Date.now()) delete table[key];
}
function checkResource(resource: URL | undefined, expected: string) {
  if (!resource || resource.href !== expected)
    throw new InvalidTargetError("Resource must match Atlas MCP URL");
}
function validGrant(g: Grant | undefined, client: string): asserts g is Grant {
  if (!g || g.clientId !== client || g.expires <= Date.now())
    throw new InvalidGrantError("Expired or invalid grant");
}
export class AtlasOAuthProvider implements OAuthServerProvider {
  readonly resource: string;
  constructor(readonly publicUrl: URL) {
    this.resource = new URL("/mcp", publicUrl).href;
  }
  clientsStore = {
    getClient: async (id: string) => oauthState((s) => s.clients[id]),
    registerClient: async (
      input: Omit<
        OAuthClientInformationFull,
        "client_id" | "client_id_issued_at"
      >,
    ) =>
      oauthState((s) => {
        prune(s);
        const authorized = new Set(
          [
            ...Object.values(s.access),
            ...Object.values(s.refresh),
            ...Object.values(s.codes),
          ].map((g) => g.clientId),
        );
        // Unconsented registrations are disposable, not a permanent global quota.
        const unused = Object.values(s.clients)
          .filter((c) => !authorized.has(c.client_id))
          .sort(
            (a, b) =>
              (a.client_id_issued_at || 0) - (b.client_id_issued_at || 0),
          );
        while (Object.keys(s.clients).length >= 200 && unused.length)
          delete s.clients[unused.shift()!.client_id];
        for (const [key, g] of Object.entries(s.pending))
          if (!s.clients[g.clientId]) delete s.pending[key];
        if (Object.keys(s.clients).length >= 200)
          throw new InvalidClientMetadataError(
            "Too many active clients; revoke an unused connection",
          );
        if (
          !input.redirect_uris.length ||
          input.redirect_uris.length > 10 ||
          input.redirect_uris.some((uri) => {
            try {
              const u = new URL(uri);
              return (
                !!(u.username || u.password || u.hash) ||
                !(
                  u.protocol === "https:" ||
                  (u.protocol === "http:" &&
                    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
                )
              );
            } catch {
              return true;
            }
          })
        )
          throw new InvalidClientMetadataError(
            "HTTPS or loopback redirect required",
          );
        const client: OAuthClientInformationFull = {
          ...input,
          client_id: secret(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        s.clients[client.client_id] = client;
        return client;
      }),
  };
  async authorize(
    client: OAuthClientInformationFull,
    p: AuthorizationParams,
    res: Response,
  ) {
    checkResource(p.resource, this.resource);
    if (
      !client.redirect_uris.some((uri) =>
        redirectUriMatches(p.redirectUri, uri),
      ) ||
      !p.codeChallenge
    )
      throw new InvalidGrantError("Invalid redirect or challenge");
    const requested = p.scopes?.length
      ? p.scopes
      : ["research:read", "research:submit"];
    if (
      requested.some((x) => !scopes.includes(x)) ||
      !requested.includes("research:read")
    )
      throw new InvalidScopeError("Unsupported scopes");
    const pending = secret(),
      csrf = secret();
    await oauthState((s) => {
      prune(s);
      if (Object.keys(s.pending).length >= 1000)
        throw new InvalidGrantError("Too many pending requests");
      s.pending[digest(pending)] = {
        clientId: client.client_id,
        scopes: requested,
        resource: this.resource,
        expires: Date.now() + 600000,
        redirectUri: p.redirectUri,
        challenge: p.codeChallenge,
        state: p.state,
        csrf: digest(csrf),
      };
    });
    res.cookie("atlas_oauth_csrf", csrf, {
      httpOnly: true,
      secure: this.publicUrl.protocol === "https:",
      sameSite: "strict",
      path: "/agent/consent",
      maxAge: 600000,
    });
    res.redirect(
      new URL(
        `/agent/consent?request=${encodeURIComponent(pending)}`,
        this.publicUrl,
      ).href,
    );
  }
  async pending(request: string) {
    return oauthState((s) => {
      const g = s.pending[digest(request)];
      if (!g || g.expires <= Date.now())
        throw new InvalidGrantError("Authorization request expired");
      return { grant: g, client: s.clients[g.clientId] };
    });
  }
  async consent(request: string, csrf: string) {
    return oauthState((s) => {
      const key = digest(request),
        g = s.pending[key];
      if (!g || g.expires <= Date.now() || g.csrf !== digest(csrf))
        throw new InvalidGrantError("Authorization request invalid");
      delete s.pending[key];
      const code = secret();
      s.codes[digest(code)] = {
        ...g,
        csrf: undefined,
        expires: Date.now() + 120000,
      };
      const target = new URL(g.redirectUri!);
      target.searchParams.set("code", code);
      if (g.state !== undefined) target.searchParams.set("state", g.state);
      target.searchParams.set("iss", this.publicUrl.href);
      return target.href;
    });
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    return oauthState((s) => {
      const g = s.codes[digest(code)];
      validGrant(g, client.client_id);
      return g.challenge!;
    });
  }
  private issue(s: OAuthState, g: Grant): OAuthTokens {
    const access = secret(),
      refresh = secret(),
      family = g.family || secret();
    s.access[digest(access)] = { ...g, family, expires: Date.now() + 3600000 };
    if (g.scopes.includes("offline_access"))
      s.refresh[digest(refresh)] = {
        ...g,
        family,
        expires: Date.now() + 30 * 86400000,
      };
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: 3600,
      scope: g.scopes.join(" "),
      ...(g.scopes.includes("offline_access")
        ? { refresh_token: refresh }
        : {}),
    };
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirect?: string,
    resource?: URL,
  ) {
    checkResource(resource, this.resource);
    return oauthState((s) => {
      prune(s);
      const key = digest(code),
        g = s.codes[key];
      validGrant(g, client.client_id);
      if (redirect !== g.redirectUri)
        throw new InvalidGrantError("Redirect mismatch");
      delete s.codes[key];
      return this.issue(s, g);
    });
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    requested?: string[],
    resource?: URL,
  ) {
    checkResource(resource, this.resource);
    const outcome = await oauthState((s) => {
      prune(s);
      const key = digest(token),
        g = s.refresh[key];
      validGrant(g, client.client_id);
      if (g.used) {
        for (const table of [s.access, s.refresh])
          for (const [k, v] of Object.entries(table))
            if (v.family === g.family) delete table[k];
        // Commit revocation before reporting failure; throwing here would roll it back.
        return { replay: true as const };
      }
      if (requested?.some((x) => !g.scopes.includes(x)))
        throw new InvalidScopeError("Cannot expand scope");
      s.refresh[key] = { ...g, used: true };
      return {
        tokens: this.issue(s, {
          ...g,
          used: undefined,
          scopes: requested || g.scopes,
        }),
      };
    });
    if ("replay" in outcome)
      throw new InvalidGrantError(
        "Refresh token replay; connection revoked, please authorize again",
      );
    return outcome.tokens;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return oauthState((s) => {
      const g = s.access[digest(token)];
      if (!g || g.expires <= Date.now() || g.resource !== this.resource)
        throw new InvalidTokenError("Invalid or expired access token");
      return {
        token,
        clientId: g.clientId,
        scopes: g.scopes,
        expiresAt: Math.floor(g.expires / 1000),
        resource: new URL(g.resource),
      };
    });
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    await oauthState((s) => {
      const key = digest(request.token),
        g = s.access[key] || s.refresh[key];
      if (!g || g.clientId !== client.client_id) return;
      for (const table of [s.access, s.refresh])
        for (const [k, v] of Object.entries(table))
          if (v.family === g.family) delete table[k];
    });
  }
}
