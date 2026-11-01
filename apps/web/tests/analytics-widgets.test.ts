import { it, expect } from "vitest";
import {
  widgetRegistry,
  createWidget,
  validateWidget,
} from "@/lib/widgets/registry";
import { dispatch } from "@/lib/api";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
it("saves and restores stable analytics widget configs through workspace API", async () => {
  process.env.DATA_MODE = "demo";
  process.env.LOCAL_DEV_NO_AUTH = "true";
  const dir = await mkdtemp(join(tmpdir(), "analytics-widgets-"));
  process.env.ATLAS_DEMO_STATE_PATH = join(dir, "state.json");
  const call = (path: string, method = "GET", data?: unknown) =>
    dispatch(
      new Request("http://localhost:3000/api/v1/" + path, {
        method,
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
    );
  try {
    const d = await (
      await call("dashboards", "POST", { name: "analysis" })
    ).json();
    for (const type of ["correlation-matrix", "rolling-correlation"] as const) {
      const w = createWidget(type, {
        ...widgetRegistry[type].defaultConfig,
        seriesIds: [...widgetRegistry[type].defaultConfig.seriesIds],
      });
      expect(validateWidget(w)).toBe(true);
      expect(
        (await call("dashboards/" + d.id + "/widgets", "PUT", { widgets: [w] }))
          .status,
      ).toBe(200);
      const all = await (await call("dashboards")).json();
      expect(
        all.items.find((x: { id: string }) => x.id === d.id).widgets[0].config
          .seriesIds,
      ).toEqual(w.config.seriesIds);
      expect(
        (
          await call("dashboards/" + d.id + "/widgets", "PUT", {
            widgets: [{ ...w, config: { ...w.config, window: 13 } }],
          })
        ).status,
      ).toBe(400);
    }
  } finally {
    delete process.env.ATLAS_DEMO_STATE_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});
