import { describe, it, expect } from "vitest";
import {
  scenario,
  validatePortfolio,
  weightedShock,
  type PortfolioInput,
} from "@/lib/analytics/portfolio";

const portfolio = (positions: PortfolioInput["positions"]): PortfolioInput => ({
  name: "压力测试",
  baseCurrency: "CNY",
  mode: "percent",
  positions,
  thresholds: [5, 10, 20],
});
const cash = {
  assetId: "CASH_CNY",
  value: 75,
  exposureCurrency: "CNY" as const,
};
describe("hypothetical portfolio scenarios", () => {
  it("25% times -40% contributes exactly -10 percentage points", () => {
    const p = portfolio([
      { assetId: "FRED_NASDAQ100", value: 25, exposureCurrency: "CNY" },
      cash,
    ]);
    const result = scenario(p, { FRED_NASDAQ100: -40 });
    expect(result.returnPct).toBeCloseTo(-10);
    expect(result.contributions[0].contributionPct).toBeCloseTo(-10);
    expect(result.thresholds.map((t) => t.breached)).toEqual([
      true,
      true,
      false,
    ]);
  });
  it("computes the mixed -12% example and explicit cash", () => {
    // Bond input here is an abstract manual scenario, not an invented catalog asset.
    expect(
      weightedShock([
        { weightPct: 25, shockPct: -40 },
        { weightPct: 10, shockPct: -10 },
        { weightPct: 20, shockPct: -5 },
        { weightPct: 45, shockPct: 0 },
      ]),
    ).toBeCloseTo(-12);
    const p = portfolio([
      { assetId: "FRED_NASDAQ100", value: 30, exposureCurrency: "CNY" },
      { assetId: "SGE_AU9999_D1", value: 20, exposureCurrency: "CNY" },
      { ...cash, value: 50 },
    ]);
    expect(
      scenario(p, { FRED_NASDAQ100: -30, SGE_AU9999_D1: -15 }).returnPct,
    ).toBeCloseTo(-12);
    expect(scenario(p, { CASH_CNY: -80 }).contributions[2].returnPct).toBe(0);
  });
  it("rejects missing weight, leverage, duplicate, macro and empty portfolios", () => {
    expect(() =>
      validatePortfolio(portfolio([{ ...cash, value: 90 }])),
    ).toThrow(/100/);
    expect(() =>
      validatePortfolio(portfolio([{ ...cash, value: -1 }])),
    ).toThrow();
    expect(() =>
      validatePortfolio(
        portfolio([
          { ...cash, value: 50 },
          { ...cash, value: 50 },
        ]),
      ),
    ).toThrow(/重复/);
    expect(() =>
      validatePortfolio(
        portfolio([{ ...cash, assetId: "FRED_DGS10", value: 100 }]),
      ),
    ).toThrow(/价格/);
    expect(() => validatePortfolio(portfolio([]))).toThrow();
  });
  it("normalizes amounts already valued in base currency", () => {
    const p = {
      ...portfolio([
        { assetId: "FRED_SP500", value: 25000, exposureCurrency: "CNY" },
        { ...cash, value: 75000 },
      ]),
      mode: "amount" as const,
    };
    const result = scenario(p, { FRED_SP500: -40 });
    expect(result.returnPct).toBeCloseTo(-10);
    expect(result.profitLoss).toBeCloseTo(-10000);
    expect(result.beforeAmount).toBe(100000);
    expect(result.afterAmount).toBeCloseTo(90000);
    expect(result.contributions[0].weightPct).toBe(25);
  });
  it("values percent portfolios before and after shocks, including offset loss contributions", () => {
    const p = {
      ...portfolio([
        { assetId: "FRED_NASDAQ100", value: 50, exposureCurrency: "CNY" },
        { assetId: "SGE_AU9999_D1", value: 50, exposureCurrency: "CNY" },
      ]),
      initialValue: 200000,
    };
    const result = scenario(p, { FRED_NASDAQ100: -20, SGE_AU9999_D1: 10 });
    expect(result.beforeAmount).toBe(200000);
    expect(result.afterAmount).toBeCloseTo(190000);
    expect(result.profitLoss).toBeCloseTo(-10000);
    expect(result.totalLoss).toBeCloseTo(10000);
    expect(result.contributions[0].profitLoss).toBeCloseTo(-20000);
    expect(result.contributions[0].lossContributionRatio).toBeCloseTo(2);
    expect(result.contributions[1].lossContributionRatio).toBeCloseTo(-1);
    expect(scenario(p, {}).contributions[0].lossContributionRatio).toBeNull();
    expect(scenario({ ...p, initialValue: undefined }, {}).beforeAmount).toBe(
      100000,
    );
    expect(() => scenario({ ...p, initialValue: 0 }, {})).toThrow();
  });
  it("applies multiplicative FX once to USD exposure, even USD cash", () => {
    const p = portfolio([
      { assetId: "FRED_SP500", value: 50, exposureCurrency: "USD" },
      { assetId: "CASH_USD", value: 50, exposureCurrency: "USD" },
    ]);
    const result = scenario(p, { FRED_SP500: -20 }, 10);
    expect(result.contributions[0].returnPct).toBeCloseTo(-12);
    expect(result.contributions[1].returnPct).toBeCloseTo(10);
    expect(result.returnPct).toBeCloseTo(-1);
    expect(
      scenario({ ...p, baseCurrency: "USD" }, { FRED_SP500: -20 }, 10)
        .returnPct,
    ).toBeCloseTo(-10);
  });
  it("converts CNY exposure inversely for USD base and protects cash currency", () => {
    expect(
      scenario(
        { ...portfolio([{ ...cash, value: 100 }]), baseCurrency: "USD" },
        {},
        25,
      ).returnPct,
    ).toBeCloseTo(-20);
    expect(() =>
      validatePortfolio(
        portfolio([{ ...cash, value: 100, exposureCurrency: "USD" }]),
      ),
    ).toThrow(/现金/);
    expect(() =>
      scenario(portfolio([{ ...cash, value: 100 }]), {}, -100),
    ).toThrow();
  });
  it("requires an explicit FX assumption and alerts on high volatility allocation", () => {
    const p = portfolio([
      { assetId: "FRED_NASDAQ100", value: 35, exposureCurrency: "USD" },
      { ...cash, value: 65 },
    ]);
    expect(() => scenario(p, {})).toThrow(/显式/);
    expect(scenario(p, {}, 0).highVolatility).toMatchObject({
      weightPct: 35,
      targetPct: 25,
      limitPct: 30,
      breached: true,
    });
    expect(
      scenario({ ...p, highVolatilityLimitPct: 40 }, {}, 0).highVolatility
        .breached,
    ).toBe(false);
  });
});
