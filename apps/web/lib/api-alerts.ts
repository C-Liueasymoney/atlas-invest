import { z } from "zod";
import { workspace } from "./db/workspace";
import { evaluateAlerts } from "./alerts";
import { seriesById } from "./catalog";
import { AppError } from "./errors";
import { body, parse, json } from "./api-helpers";
import { audit } from "./providers/repository";
export async function alertsApi(
  request: Request,
  p: string[],
): Promise<Response | undefined> {
  if (p[0] !== "alerts") return;
  const method = request.method;
  if (p[1] === "evaluate" && method === "POST")
    return json(await evaluateAlerts());
  if (p.length === 1 && method === "POST") {
    const d = parse(
      z.object({
        seriesId: z.string(),
        conditionType: z.enum([
          "crosses_above",
          "crosses_below",
          "pct_change",
          "data_stale",
          "new_observation",
        ]),
        params: z.object({
          threshold: z.number().finite().optional(),
          window: z.number().int().min(1).max(252).optional(),
        }),
        cooldownSeconds: z.number().int().min(0).max(604800).default(3600),
      }),
      await body(request),
    );
    seriesById(d.seriesId);
    if (
      ["crosses_above", "crosses_below", "pct_change"].includes(
        d.conditionType,
      ) &&
      d.params.threshold === undefined
    )
      throw new AppError("VALIDATION_ERROR", "该规则需要阈值");
    const item = await workspace((s) => {
      if (s.alerts.length >= 100)
        throw new AppError("VALIDATION_ERROR", "最多100个预警");
      const item = { id: crypto.randomUUID(), ...d, enabled: true, state: {} };
      s.alerts.push(item);
      return item;
    }, true);
    await audit("alert.create", item.id);
    return json(item, 201);
  }
  if (p.length === 2 && ["PATCH", "DELETE"].includes(method)) {
    const enabled =
      method === "PATCH"
        ? parse(z.object({ enabled: z.boolean() }), await body(request)).enabled
        : false;
    const result = await workspace((s) => {
      const item = s.alerts.find((a) => a.id === p[1]);
      if (!item) throw new AppError("FORBIDDEN", "预警不存在或无权限", 404);
      if (method === "PATCH") item.enabled = enabled;
      else {
        s.alerts = s.alerts.filter((a) => a !== item);
        s.events = s.events.filter((e) => e.alertId !== item.id);
      }
      return { status: "success" };
    }, true);
    await audit("alert." + method.toLowerCase(), p[1]);
    return json(result);
  }
}
