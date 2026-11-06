import { expect, it } from "vitest";
import { oauthLoginReturnTo } from "../lib/auth/return-to";
import { dispatch } from "../lib/api";

const agent = "https://atlas.example";
const pending = agent + "/agent/consent?request=" + "a".repeat(43);
it("only returns to the configured pending OAuth page", () => {
  expect(oauthLoginReturnTo(pending, agent)).toBe(pending);
  expect(
    oauthLoginReturnTo("/agent/consent?request=" + "a".repeat(43), agent),
  ).toBe(pending);
  for (const value of [
    "https://evil.example/agent/consent?request=" + "a".repeat(43),
    "//evil.example/agent/consent?request=" + "a".repeat(43),
    "javascript:alert(1)",
    pending + "#fragment",
    pending + "&next=https://evil.example",
    agent + "/dashboard",
    agent + "/agent/consent?request=short",
  ])
    expect(oauthLoginReturnTo(value, agent)).toBeUndefined();
});
it("normal website login keeps its response and OAuth login returns to the allowlisted origin", async () => {
  const original = { ...process.env };
  Object.assign(process.env, {
    DATA_MODE: "demo",
    NODE_ENV: "test",
    OWNER_PASSWORD: "website-login-test-password",
    SESSION_SECRET: "website-login-signing-secret-long-enough",
    APP_BASE_URL: "http://localhost:3000",
    ATLAS_AGENT_PUBLIC_URL: agent,
  });
  const login = (returnTo?: string) =>
    dispatch(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          password: process.env.OWNER_PASSWORD,
          returnTo,
        }),
      }),
    );
  try {
    expect(await (await login()).json()).toEqual({ authenticated: true });
    expect((await (await login(pending)).json()).returnTo).toBe(pending);
    expect(
      (await (await login("https://evil.example/")).json()).returnTo,
    ).toBeUndefined();
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
