import { seriesData } from "./data";
import { AppError } from "./errors";
import { inflationInputs, inflationPeriod } from "./inflation-period";
export async function inflationSummary(
  id: string,
  from = "1900-01-01",
  to = new Date().toISOString().slice(0, 10),
) {
  const input = Object.hasOwn(inflationInputs, id)
    ? inflationInputs[id]
    : undefined;
  if (!input)
    throw new AppError("INVALID_SERIES", "仅支持中美 CPI 同比指标的区间分析");
  const data = await seriesData(input.id, from.slice(0, 7) + "-01", to);
  return {
    ...inflationPeriod(data.points, input.method, from, to),
    source: data.source,
    sourceStatus: data.status,
    isDemo: data.isDemo,
    fetchedAt: data.fetchedAt,
    requestedFrom: from,
    requestedTo: to,
    inputSeriesId: input.id,
  };
}
