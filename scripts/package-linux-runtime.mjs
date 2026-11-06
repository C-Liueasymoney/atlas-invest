// Build-only release packaging. Never reads deployment credentials or local state.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error(
    "Package Next standalone on Linux x64; do not deploy Mac native dependencies",
  );
const temporary = await mkdtemp(join(tmpdir(), "atlas-linux-release-"));
const output = resolve(".atlas/release");
try {
  const source = join(temporary, "source.tar");
  execFileSync("git", ["archive", "--format=tar", "--output", source, "HEAD"]);
  execFileSync("tar", ["-xf", source, "-C", temporary]);
  await rm(source);
  await mkdir(join(temporary, "apps/web/.next"), { recursive: true });
  await cp(
    "apps/web/.next/standalone",
    join(temporary, "apps/web/.next/standalone"),
    { recursive: true },
  );
  await mkdir(join(temporary, "runtime"));
  for (const file of ["server.mjs", "db.mjs"])
    await cp(join(".atlas/runtime", file), join(temporary, "runtime", file));
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  await writeFile(join(temporary, "release-source-sha.txt"), sha + "\n");
  // A build runner must not silently package any private dotenv file.
  const forbidden = execFileSync(
    "find",
    [
      temporary,
      "-type",
      "f",
      "(",
      "-name",
      ".env",
      "-o",
      "-name",
      ".env.local",
      "-o",
      "-name",
      ".env.production",
      ")",
    ],
    { encoding: "utf8" },
  ).trim();
  if (forbidden)
    throw new Error("Refusing release containing private environment files");
  await mkdir(output, { recursive: true });
  const archive = join(output, "atlas-linux-runtime.tgz");
  execFileSync("tar", ["-czf", archive, "-C", temporary, "."]);
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(
    join(output, "atlas-linux-runtime.sha256"),
    `${digest}  atlas-linux-runtime.tgz\n`,
  );
  console.log(`Linux runtime packaged for ${sha}; SHA256 ${digest}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
