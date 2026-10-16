if (
  process.env.LOCAL_DEV_NO_AUTH === "true" ||
  (process.env.OWNER_PASSWORD?.length || 0) < 12 ||
  (process.env.SESSION_SECRET?.length || 0) < 32
) {
  console.error(
    "Private production requires LOCAL_DEV_NO_AUTH=false, OWNER_PASSWORD>=12 and SESSION_SECRET>=32.",
  );
  process.exit(1);
}
await import(new URL("./apps/web/server.js", import.meta.url));
