import type { Point, Quote } from "./types";
export function withLatestQuote(
  points: Point[],
  quote: Pick<Quote, "value" | "asOf" | "asOfKind" | "isDemo"> | undefined,
  timezone: string,
): Point[] {
  if (
    !quote ||
    quote.isDemo ||
    quote.value == null ||
    !Number.isFinite(Number(quote.value)) ||
    !quote.asOf
  )
    return points;
  const date =
    quote.asOfKind === "date"
      ? quote.asOf.slice(0, 10)
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(quote.asOf));
  if (points.at(-1)?.time && date < points.at(-1)!.time) return points;
  const displayed = points.map((p) => ({ ...p }));
  if (displayed.at(-1)?.time === date)
    displayed[displayed.length - 1] = { time: date, value: quote.value };
  else displayed.push({ time: date, value: quote.value });
  return displayed;
}
