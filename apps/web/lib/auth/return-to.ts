// Only an exact pending Atlas OAuth page can be a login return destination.
export function oauthLoginReturnTo(value: unknown, agentOrigin?: string) {
  if (typeof value !== "string" || !agentOrigin) return undefined;
  try {
    const expected = new URL(agentOrigin);
    const target = new URL(value, expected);
    if (
      target.origin !== expected.origin ||
      target.username ||
      target.password ||
      target.hash ||
      target.pathname !== "/agent/consent" ||
      !/^[A-Za-z0-9_-]{20,200}$/.test(
        target.searchParams.get("request") || "",
      ) ||
      [...target.searchParams.keys()].some((key) => key !== "request")
    )
      return undefined;
    return target.href;
  } catch {
    return undefined;
  }
}
