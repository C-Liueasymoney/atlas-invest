import { z } from "zod";
import { AppError } from "../errors";

export const portfolioAssets = [
  { id: "SGE_AU9999_D1", name: "上金所 Au99.99", currency: "CNY" },
  { id: "XAUUSD_QUOTE", name: "国际黄金（美元参考价）", currency: "USD" },
  { id: "FRED_NASDAQ100", name: "纳斯达克100价格指数", currency: "USD" },
  { id: "FRED_SP500", name: "标普500价格指数", currency: "USD" },
  { id: "CASH_CNY", name: "人民币现金（零本币收益）", currency: "CNY" },
  { id: "CASH_USD", name: "美元现金（零本币收益）", currency: "USD" },
] as const;
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: z.enum(["CNY", "USD"]),
  mode: z.enum(["percent", "amount"]),
  initialValue: z.number().finite().positive().max(1e15).optional(),
  positions: z
    .array(
      z.object({
        assetId: z.string().min(1).max(80),
        value: z.number().finite().nonnegative().max(1e15),
        exposureCurrency: z.enum(["CNY", "USD"]),
      }),
    )
    .min(1)
    .max(20),
  thresholds: z
    .array(z.number().finite().positive().max(100))
    .min(1)
    .max(10)
    .default([20]),
  highVolatilityTargetPct: z.number().finite().min(0).max(100).optional(),
  highVolatilityLimitPct: z.number().finite().min(0).max(100).optional(),
});
export type PortfolioInput = z.infer<typeof schema>;
export type SavedPortfolio = PortfolioInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export function validatePortfolio(value: unknown): PortfolioInput {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      "VALIDATION_ERROR",
      "组合字段无效：" +
        result.error.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; ")
          .slice(0, 400),
    );
  const p = result.data;
  if (new Set(p.positions.map((x) => x.assetId)).size !== p.positions.length)
    throw new AppError("VALIDATION_ERROR", "组合资产不能重复");
  for (const position of p.positions) {
    const asset = portfolioAssets.find((x) => x.id === position.assetId);
    if (!asset)
      throw new AppError(
        "VALIDATION_ERROR",
        "仅允许已注册价格资产及显式现金；宏观利率不是债券价格，不能作为持仓",
      );
    if (
      asset.id.startsWith("CASH_") &&
      position.exposureCurrency !== asset.currency
    )
      throw new AppError("VALIDATION_ERROR", "现金币种必须与货币敞口一致");
  }
  const total = p.positions.reduce((sum, x) => sum + x.value, 0);
  if (total <= 0 || !Number.isFinite(total))
    throw new AppError("VALIDATION_ERROR", "组合总额必须大于零");
  if (p.mode === "percent" && Math.abs(total - 100) > 1e-6)
    throw new AppError(
      "VALIDATION_ERROR",
      "权重合计必须为100%；未投资部分请显式添加现金",
    );
  return {
    ...p,
    initialValue: p.initialValue ?? 100000,
    thresholds: [...new Set(p.thresholds)].sort((a, b) => a - b),
  };
}
export const shockPresets = [
  {
    id: "equity",
    name: "假设：股票下跌40%",
    shocks: { FRED_NASDAQ100: -40, FRED_SP500: -40 },
    fxShockPct: 0,
  },
  {
    id: "gold",
    name: "假设：黄金下跌20%",
    shocks: { SGE_AU9999_D1: -20, XAUUSD_QUOTE: -20 },
    fxShockPct: 0,
  },
  {
    id: "combined",
    name: "假设：股金齐跌、美元升值10%",
    shocks: {
      FRED_NASDAQ100: -30,
      FRED_SP500: -30,
      SGE_AU9999_D1: -15,
      XAUUSD_QUOTE: -15,
    },
    fxShockPct: 10,
  },
] as const;
export function weightedShock(
  positions: { weightPct: number; shockPct: number }[],
) {
  return positions.reduce(
    (sum, p) => sum + (p.weightPct * p.shockPct) / 100,
    0,
  );
}
export function scenario(
  input: unknown,
  shocks: Record<string, number> = {},
  fxShockPct?: number,
) {
  const p = validatePortfolio(input);
  if (
    p.positions.some(
      (x) => x.value > 0 && x.exposureCurrency !== p.baseCurrency,
    ) &&
    fxShockPct === undefined
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "外币敞口必须显式填写USD/CNY汇率冲击假设（可为0）",
    );
  const fx = fxShockPct ?? 0;
  if (!Number.isFinite(fx) || fx <= -100 || fx > 1000)
    throw new AppError(
      "VALIDATION_ERROR",
      "USD/CNY汇率冲击须大于-100%且不超过1000%",
    );
  for (const [id, shock] of Object.entries(shocks)) {
    if (
      !portfolioAssets.some((x) => x.id === id) ||
      !Number.isFinite(shock) ||
      shock < -100 ||
      shock > 1000
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "资产冲击无效，价格跌幅不得超过100%",
      );
  }
  const total = p.positions.reduce((sum, x) => sum + x.value, 0);
  const beforeAmount = p.mode === "amount" ? total : (p.initialValue ?? 100000);
  const contributions = p.positions.map((position) => {
    const asset = portfolioAssets.find((x) => x.id === position.assetId)!;
    const localShockPct = asset.id.startsWith("CASH_")
      ? 0
      : (shocks[position.assetId] ?? 0);
    const fxFactor =
      position.exposureCurrency === p.baseCurrency
        ? 1
        : p.baseCurrency === "CNY"
          ? 1 + fx / 100
          : 1 / (1 + fx / 100);
    const returnPct = ((1 + localShockPct / 100) * fxFactor - 1) * 100;
    const weightPct = (position.value / total) * 100;
    const contributionPct = (weightPct * returnPct) / 100;
    const positionBeforeAmount = (beforeAmount * weightPct) / 100;
    const profitLoss = (beforeAmount * contributionPct) / 100;
    return {
      ...position,
      name: asset.name,
      weightPct,
      localShockPct,
      fxReturnPct: (fxFactor - 1) * 100,
      returnPct,
      contributionPct,
      beforeAmount: positionBeforeAmount,
      afterAmount: positionBeforeAmount + profitLoss,
      profitLoss,
    };
  });
  const returnPct = contributions.reduce(
    (sum, x) => sum + x.contributionPct,
    0,
  );
  const highVolatilityWeightPct = contributions
    .filter((x) => ["FRED_NASDAQ100", "FRED_SP500"].includes(x.assetId))
    .reduce((sum, x) => sum + x.weightPct, 0);
  return {
    hypothetical: true,
    baseCurrency: p.baseCurrency,
    returnPct,
    lossPct: Math.max(0, -returnPct),
    profitLoss: (beforeAmount * returnPct) / 100,
    totalLoss: Math.max(0, (-beforeAmount * returnPct) / 100),
    beforeAmount,
    afterAmount: beforeAmount * (1 + returnPct / 100),
    totalAmount: beforeAmount,
    contributions: contributions.map((c) => ({
      ...c,
      lossContributionRatio:
        returnPct < -1e-9 ? c.contributionPct / returnPct : null,
    })),
    highVolatility: {
      assetIds: ["FRED_NASDAQ100", "FRED_SP500"],
      weightPct: highVolatilityWeightPct,
      targetPct: p.highVolatilityTargetPct ?? 25,
      limitPct: p.highVolatilityLimitPct ?? 30,
      breached:
        highVolatilityWeightPct > (p.highVolatilityLimitPct ?? 30) + 1e-9,
    },
    thresholds: p.thresholds.map((lossPct) => ({
      lossPct,
      breached: -returnPct + 1e-9 >= lossPct,
    })),
    warnings: [
      "假设情景仅用于理解敞口，不是预测或投资建议。",
      "冲击为所选货币敞口下的资产收益；USD/CNY表示一美元对应人民币变化，外币收益与汇率乘法合成一次。",
      "金额须为已换算的基准币市值；现金本币收益为零，不含利息、费用、税、再平衡或股息。",
      "价格指数不等于可交易ETF，利率指标不能代替债券价格。",
    ],
  };
}
export type ScenarioResult = ReturnType<typeof scenario>;
