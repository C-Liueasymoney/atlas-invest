import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { database, demoMode } from "../db/client";
import { OWNER_ID } from "../auth/session";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export type Grant = {
  used?: boolean;
  clientId: string;
  scopes: string[];
  resource: string;
  expires: number;
  family?: string;
  redirectUri?: string;
  challenge?: string;
  csrf?: string;
  state?: string;
};
export type OAuthState = {
  clients: Record<string, OAuthClientInformationFull>;
  pending: Record<string, Grant>;
  codes: Record<string, Grant>;
  access: Record<string, Grant>;
  refresh: Record<string, Grant>;
};
export const emptyOAuthState = (): OAuthState => ({
  clients: {},
  pending: {},
  codes: {},
  access: {},
  refresh: {},
});
let queue: Promise<unknown> = Promise.resolve();
// The OAuth sidecar is a single process. Live additionally locks the row across processes.
export async function oauthState<T>(
  fn: (s: OAuthState) => T | Promise<T>,
): Promise<T> {
  if (!demoMode())
    return database().begin(async (tx) => {
      await tx`INSERT INTO agent_oauth_state(owner_id,state) VALUES(${OWNER_ID},${tx.json(emptyOAuthState())}) ON CONFLICT DO NOTHING`;
      const rows =
        await tx`SELECT state FROM agent_oauth_state WHERE owner_id=${OWNER_ID} FOR UPDATE`;
      const state = rows[0].state as OAuthState;
      const result = await fn(state);
      await tx`UPDATE agent_oauth_state SET state=${tx.json(JSON.parse(JSON.stringify(state)))} WHERE owner_id=${OWNER_ID}`;
      return result;
    }) as Promise<T>;
  const task = queue.then(async () => {
    const path =
      process.env.ATLAS_OAUTH_STATE_PATH ||
      resolve(
        process.env.ATLAS_PROJECT_ROOT || process.cwd(),
        ".atlas",
        `oauth-${process.env.DATA_MODE === "preview" ? "preview" : "demo"}.json`,
      );
    let state = emptyOAuthState();
    try {
      state = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const result = await fn(state);
    await mkdir(dirname(path), { recursive: true });
    const tmp = path + "." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
    await rename(tmp, path);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
