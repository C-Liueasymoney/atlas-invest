import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve(process.env.ATLAS_RUNTIME_OUTPUT || ".atlas/runtime");
await mkdir(out, { recursive: true });
await build({
  entryPoints: { server: "apps/web/lib/agent/start.ts", db: "scripts/db.mjs" },
  outdir: out,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: "apps/web/tsconfig.json",
  banner: {
    js: 'import { createRequire as atlasCreateRequire } from "node:module"; const require = atlasCreateRequire(import.meta.url);',
  },
  logLevel: "info",
});
console.log(`Node runtime artifacts: ${out}`);
