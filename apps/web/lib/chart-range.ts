export const ranges = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "ALL"];
export function rangeFrom(range: string, now = new Date()) {
  if (range === "ALL") return "";
  const match = /^(\d+)(M|Y)$/.exec(range);
  if (
    !match ||
    Number(match[1]) < 1 ||
    Number(match[1]) > (match[2] === "Y" ? 100 : 1200)
  )
    throw Error("Invalid chart range");
  const date = new Date(now);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(
    date.getUTCMonth() - Number(match[1]) * (match[2] === "Y" ? 12 : 1),
  );
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
