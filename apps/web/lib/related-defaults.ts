// Research comparisons, not a claim of measured statistical correlation.
const gold = [
  "XAUUSD_QUOTE",
  "FX_USDCNY_D1",
  "DERIVED_XAU_CNYG",
  "DERIVED_SGE_PREMIUM",
  "FRED_DFII10",
];
const international = [
  "SGE_AU9999_D1",
  "FX_USDCNY_D1",
  "FRED_DFII10",
  "FRED_DTWEXBGS",
  "CFTC_GOLD_NET_SPEC_W",
];
export const relatedDefaults: Record<string, string[]> = {
  SGE_AU9999_D1: gold,
  SGE_AU9999_QUOTE: gold,
  XAUUSD_QUOTE: international,
  DERIVED_XAU_CNYG: international,
  FRED_NASDAQ100: ["FRED_SP500", "FRED_DGS10", "FRED_DFF", "FRED_DTWEXBGS"],
  FRED_SP500: ["FRED_NASDAQ100", "FRED_DGS10", "FRED_DFF", "FRED_CPILFESL"],
  FX_USDCNY_D1: ["FRED_DTWEXBGS", "FRED_DFF"],
};
