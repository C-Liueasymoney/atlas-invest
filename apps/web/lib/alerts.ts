import Decimal from "decimal.js";
import type { Alert, AlertEvent, Quote, Point } from "./types";
import { quote, seriesData } from "./data";
import { workspace } from "./db/workspace";
export function evaluateRule(
  input: Alert,
  q: Quote,
  history: Point[],
  now = Date.now(),
): { alert: Alert; event?: AlertEvent } {
  const alert: Alert = {
    ...input,
    state: { ...input.state },
    lastEvaluatedAt: new Date(now).toISOString(),
  };
  if (!alert.enabled) return { alert };
  const oldValue =
      typeof alert.state.previousValue === "string"
        ? alert.state.previousValue
        : null,
    oldAsOf =
      typeof alert.state.previousAsOf === "string"
        ? alert.state.previousAsOf
        : null;
  const changed = q.asOf !== oldAsOf;
  const threshold = alert.params.threshold ?? 0;
  let fire = false,
    condition = Boolean(alert.state.active);
  const usable =
    q.value !== null && ["fresh", "delayed", "demo"].includes(q.status);
  if (alert.conditionType === "data_stale") {
    condition = ["stale", "unavailable", "not_configured"].includes(q.status);
    fire = condition && !alert.state.active;
  } else if (alert.conditionType === "new_observation") {
    fire = !!oldAsOf && !!q.asOf && q.asOf > oldAsOf;
  } else if (usable && changed) {
    const v = new Decimal(q.value!);
    if (alert.conditionType === "crosses_above" && oldValue !== null)
      fire = new Decimal(oldValue).lte(threshold) && v.gt(threshold);
    if (alert.conditionType === "crosses_below" && oldValue !== null)
      fire = new Decimal(oldValue).gte(threshold) && v.lt(threshold);
    if (alert.conditionType === "pct_change") {
      const points = history.filter(
        (p) => p.value !== null && p.time <= (q.asOf?.slice(0, 10) || ""),
      );
      const previous = points.at(-(alert.params.window ?? 1) - 1)?.value;
      if (previous && new Decimal(previous).gt(0)) {
        const pct = v.div(previous).minus(1).mul(100);
        condition = threshold >= 0 ? pct.gte(threshold) : pct.lte(threshold);
        fire = condition && !alert.state.active;
      }
    }
  }
  if (
    alert.conditionType === "data_stale" ||
    alert.conditionType === "pct_change"
  )
    alert.state.active = condition;
  if (usable) {
    alert.state.previousValue = q.value;
    alert.state.previousAsOf = q.asOf;
  }
  if (alert.conditionType === "new_observation" && q.asOf)
    alert.state.previousAsOf = q.asOf;
  if (
    !fire ||
    (alert.lastFiredAt &&
      now - Date.parse(alert.lastFiredAt) < alert.cooldownSeconds * 1000)
  )
    return { alert };
  const triggeredAt = new Date(now).toISOString();
  alert.lastFiredAt = triggeredAt;
  const event: AlertEvent = {
    id: crypto.randomUUID(),
    alertId: alert.id,
    triggeredAt,
    observedValue: q.value,
    threshold: alert.params.threshold == null ? null : String(threshold),
    seriesAsOf: q.asOf,
    dedupKey: [
      alert.id,
      alert.conditionType,
      q.asOf,
      q.value,
      alert.conditionType === "data_stale" ? triggeredAt : "",
    ].join(":"),
    status: "recorded",
  };
  return { alert, event };
}
export async function evaluateAlerts(seriesId?: string) {
  const enabled = await workspace((s) =>
    s.alerts.filter((a) => a.enabled && (!seriesId || a.seriesId === seriesId)),
  );
  const ids = [...new Set(enabled.map((a) => a.seriesId))];
  const samples = await Promise.all(
    ids.map(async (id) => ({
      id,
      q: await quote(id),
      history: (await seriesData(id)).points,
    })),
  );
  return workspace((s) => {
    let triggered = 0;
    for (const a of s.alerts) {
      const sample = samples.find((x) => x.id === a.seriesId);
      if (!sample || !a.enabled) continue;
      const result = evaluateRule(a, sample.q, sample.history);
      Object.assign(a, result.alert);
      if (
        result.event &&
        !s.events.some((e) => e.dedupKey === result.event!.dedupKey)
      ) {
        s.events.unshift(result.event);
        triggered++;
      }
    }
    s.events = s.events.slice(0, 1000);
    return { evaluated: enabled.length, triggered };
  }, true);
}
