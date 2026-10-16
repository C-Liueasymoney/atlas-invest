import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors";
type Env = Record<string, string | undefined>;
export const OWNER_ID = "00000000-0000-4000-8000-000000000001";
export function assertRuntime(env: Env = process.env) {
  if (env.NODE_ENV === "production" && env.LOCAL_DEV_NO_AUTH === "true")
    throw new AppError("FORBIDDEN", "生产环境禁止本地鉴权绕过", 503);
  if (
    (env.NODE_ENV === "production" || env.DATA_MODE === "live") &&
    (!(env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) ||
      !(env.OWNER_PASSWORD && env.OWNER_PASSWORD.length >= 12))
  )
    throw new AppError(
      "FORBIDDEN",
      "请配置至少12位 OWNER_PASSWORD 和32位 SESSION_SECRET",
      503,
    );
}
export function signSession(secret: string, now = Date.now()) {
  const data = Buffer.from(
    JSON.stringify({ owner: OWNER_ID, expires: now + 86400000 }),
  ).toString("base64url");
  return (
    data + "." + createHmac("sha256", secret).update(data).digest("base64url")
  );
}
export function verifySession(token: string, secret: string, now = Date.now()) {
  try {
    const [data, sig] = token.split(".");
    const actual = Buffer.from(sig ?? "", "base64url");
    const expected = createHmac("sha256", secret).update(data).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    return p.owner === OWNER_ID && p.expires > now;
  } catch {
    return false;
  }
}
export function isLocalDemo(env: Env = process.env) {
  return (
    env.NODE_ENV !== "production" &&
    env.DATA_MODE !== "live" &&
    env.LOCAL_DEV_NO_AUTH !== "false"
  );
}
export function assertSameOrigin(request: Request, env: Env = process.env) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const expected = new URL(env.APP_BASE_URL || url.origin);
  let localAlias = false;
  try {
    const actual = new URL(origin || "");
    localAlias =
      env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname) &&
      actual.port === expected.port &&
      actual.protocol === expected.protocol;
  } catch {}
  if (origin && origin !== expected.origin && !localAlias)
    throw new AppError("FORBIDDEN", "拒绝跨站写入", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("FORBIDDEN", "拒绝跨站请求", 403);
}
export function authorize(request: Request, env: Env = process.env) {
  assertRuntime(env);
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    assertSameOrigin(request, env);
  }
  if (isLocalDemo(env) && local) return OWNER_ID;
  const cookie = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)atlas_session=([^;]+)/)?.[1];
  if (!cookie || !verifySession(cookie, env.SESSION_SECRET || ""))
    throw new AppError("UNAUTHORIZED", "请先登录个人工作台", 401);
  return OWNER_ID;
}
export function passwordMatches(actual: string, expected: string) {
  const a = createHmac("sha256", "password-compare").update(actual).digest(),
    b = createHmac("sha256", "password-compare").update(expected).digest();
  return timingSafeEqual(a, b) && expected.length >= 12;
}
