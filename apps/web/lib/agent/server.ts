import express from "express";
import { rateLimit } from "express-rate-limit";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  mcpAuthRouter,
  createOAuthMetadata,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { AtlasOAuthProvider, scopes } from "./oauth";
import { passwordMatches, assertRuntime } from "../auth/session";
import { AppError } from "../errors";
import {
  researchToolDefinitions,
  runResearchTool,
} from "../investment/service";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function createAgentApp(
  publicUrl = new URL(
    process.env.ATLAS_AGENT_PUBLIC_URL || "http://127.0.0.1:3001",
  ),
) {
  assertRuntime();
  if ((process.env.OWNER_PASSWORD?.length || 0) < 12)
    throw new Error("MCP requires an owner password of at least 12 characters");
  if (
    publicUrl.pathname !== "/" ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.username ||
    publicUrl.password ||
    (publicUrl.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        ["127.0.0.1", "localhost"].includes(publicUrl.hostname)
      ))
  )
    throw new Error(
      "ATLAS_AGENT_PUBLIC_URL must be a canonical HTTPS origin (loopback HTTP only in development)",
    );
  const app = express();
  app.use(hostHeaderValidation([publicUrl.hostname, "127.0.0.1", "localhost"]));
  app.use((req, res, next) => {
    if (req.path === "/mcp" || req.path.startsWith("/.well-known/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate, MCP-Session-Id",
      );
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
    }
    next();
  });
  app.disable("x-powered-by");
  // Exactly one local Nginx proxy; its X-Forwarded-For must replace incoming headers.
  app.set("trust proxy", "loopback");
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));
  app.use(express.json({ limit: "1100kb" }));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  const provider = new AtlasOAuthProvider(publicUrl),
    resource = new URL("/mcp", publicUrl);
  const options = {
    provider,
    issuerUrl: publicUrl,
    resourceServerUrl: resource,
    scopesSupported: scopes,
  };
  app.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.json({
      ...createOAuthMetadata(options),
      authorization_response_iss_parameter_supported: true,
    }),
  );
  app.use(mcpAuthRouter(options));
  app.get("/agent/health", (_req, res) =>
    res.json({ status: "ok", name: "atlas-invest", mcp: resource.href }),
  );
  const consentLimit = rateLimit({
    windowMs: 900000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.get("/agent/consent", async (req, res) => {
    try {
      const request = String(req.query.request || "");
      const { grant, client } = await provider.pending(request);
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      res
        .type("html")
        .send(
          `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接 Atlas Invest</title><style>body{font:16px system-ui;max-width:560px;margin:60px auto;padding:24px;line-height:1.7;background:#fafafa;color:#182221}input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:12px 0}code{overflow-wrap:anywhere}</style><h1>连接 Atlas Invest</h1><p>授权 <strong>${escape(client.client_name || "AI 客户端")}</strong> 读取你创建的研究任务并保存任务允许的分析结果。</p><p>回调地址：<code>${escape(grant.redirectUri!)}</code></p><p>权限：${escape(grant.scopes.join("、"))}</p><form method="post" action="/agent/consent"><input type="hidden" name="request" value="${escape(request)}"><label>个人工作台密码<input type="password" name="password" autocomplete="current-password" required maxlength="512"></label><button type="submit">授权连接</button></form><p>不授权可直接关闭此页面。此连接不能修改行情、数据源凭据或原始投资判断。</p></html>`,
        );
    } catch {
      res.status(400).send("授权请求无效或已过期，请从 AI 客户端重新连接。");
    }
  });
  app.post("/agent/consent", consentLimit, async (req, res) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)atlas_oauth_csrf=([^;]+)/,
    )?.[1];
    if (req.headers.origin !== publicUrl.origin || !cookie) {
      res.status(403).json({ error: "invalid_request" });
      return;
    }
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 512 ||
      !passwordMatches(req.body.password, process.env.OWNER_PASSWORD || "")
    ) {
      res.status(401).send("密码错误，请返回重试。");
      return;
    }
    try {
      const redirect = await provider.consent(
        String(req.body.request || ""),
        cookie,
      );
      res.clearCookie("atlas_oauth_csrf", { path: "/agent/consent" });
      res.redirect(redirect);
    } catch {
      res.status(400).send("授权请求无效或已使用。");
    }
  });
  app.use(
    "/mcp",
    requireBearerAuth({
      verifier: provider,
      requiredScopes: ["research:read"],
      expectedResource: resource,
      resourceMetadataUrl: new URL(
        "/.well-known/oauth-protected-resource/mcp",
        publicUrl,
      ).href,
    }),
  );
  app.post("/mcp", async (req, res) => {
    const server = new Server(
      { name: "atlas-invest", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const canSubmit = req.auth!.scopes.includes("research:submit");
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: researchToolDefinitions
        .filter((t) => canSubmit || t.name !== "submit_research_result")
        .map((t) => ({
          ...t,
          inputSchema: t.inputSchema as Tool["inputSchema"],
          annotations: {
            readOnlyHint: t.name !== "submit_research_result",
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          _meta: {
            securitySchemes: [
              {
                type: "oauth2",
                scopes: [
                  t.name === "submit_research_result"
                    ? "research:submit"
                    : "research:read",
                ],
              },
            ],
          },
        })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      if (params.name === "submit_research_result" && !canSubmit)
        return {
          isError: true,
          content: [
            { type: "text", text: "缺少 research:submit 权限，请重新授权。" },
          ],
        };
      try {
        const result = await runResearchTool(
          params.name,
          params.arguments || {},
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                e instanceof AppError
                  ? e.message
                  : "研究任务处理失败，请检查参数或稍后重试。",
            },
          ],
        };
      }
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: "server_error" });
    }
  });
  app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  return { app, provider };
}
