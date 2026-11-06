import { z } from "zod";
const text = z.string().trim().min(1).max(5000);
const short = z.string().trim().min(1).max(160);
export const day = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
export const holdingInput = z
  .strictObject({
    name: short,
    code: short.nullable(),
    market: short.nullable(),
    identityStatus: z.enum(["confirmed", "unconfirmed"]),
    assetClass: z.enum([
      "stock",
      "fund",
      "etf",
      "bond",
      "gold",
      "cash",
      "other",
    ]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    exposureCurrency: short.nullable(),
    sizing: z.enum(["value", "percent"]),
    amount: z.number().finite().nonnegative(),
    valuationDate: day,
    source: text,
    investmentScope: text,
  })
  .refine(
    (x) => x.sizing !== "percent" || x.amount <= 100,
    "持仓比例不能超过100%",
  )
  .refine(
    (x) => x.identityStatus !== "confirmed" || !!(x.code && x.market),
    "已确认资产需要代码和市场；不确定时请选择待确认",
  );
export const decisionInput = z.strictObject({
  holdingIds: z.array(z.uuid()).min(1).max(100),
  rationale: text,
  supportingEvidence: text,
  falsification: text,
  horizon: short,
  reviewDate: day,
});
export const taskInput = z
  .strictObject({
    kind: z.enum([
      "holding_analysis",
      "portfolio_analysis",
      "events",
      "decision_review",
    ]),
    holdingIds: z.array(z.uuid()).min(1).max(100).optional(),
    decisionId: z.uuid().optional(),
    from: day,
    to: day,
    previousResultId: z.uuid().optional(),
  })
  .refine((x) => x.from <= x.to, "开始日期不能晚于结束日期");
const ids = z.array(short).max(100);
const holdingIds = z.array(z.uuid()).max(100);
const source = z.strictObject({
  id: short,
  url: z
    .url()
    .max(2000)
    .refine((s) => {
      const u = new URL(s);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    }, "来源只接受无凭据的HTTP(S)链接"),
  title: short,
  publisher: short,
  publishedAt: timestamp.nullable(),
  retrievedAt: timestamp,
  coverage: text,
  access: z.enum(["full", "partial", "summary"]),
});
export const resultSchema = z.strictObject({
  kind: z.enum([
    "holding_analysis",
    "portfolio_analysis",
    "events",
    "decision_review",
  ]),
  asOf: timestamp,
  summary: text,
  facts: z
    .array(z.strictObject({ id: short, text, sourceIds: ids.min(1) }))
    .max(100),
  mechanisms: z
    .array(
      z.strictObject({
        title: short,
        explanation: text,
        holdingIds,
        conditions: text,
        counterFactors: text,
        factIds: ids,
      }),
    )
    .max(30),
  events: z
    .array(
      z.strictObject({
        title: short,
        eventDate: day.nullable(),
        datePrecision: z.enum(["day", "month", "year", "unknown"]),
        publishedAt: timestamp.nullable(),
        holdingIds,
        explanation: text,
        concept: text,
        sourceIds: ids.min(1),
      }),
    )
    .max(5),
  observations: z
    .array(
      z.strictObject({
        text,
        holdingIds,
        mechanismIndexes: z.array(z.number().int().nonnegative()).max(30),
        sourceIds: ids,
      }),
    )
    .max(30),
  review: z
    .strictObject({
      evidenceChanges: text,
      counterEvidence: text,
      unresolved: text,
    })
    .nullable(),
  sources: z.array(source).max(100),
  limitations: z.array(text).min(1).max(30),
  generation: z.literal("external_ai"),
});
export type HoldingData = z.infer<typeof holdingInput>;
export type DecisionData = z.infer<typeof decisionInput>;
export type Holding = HoldingData & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{ version: number; data: HoldingData; savedAt: string }>;
};
export type Decision = DecisionData & {
  id: string;
  version: number;
  original: DecisionData;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{ version: number; data: DecisionData; savedAt: string }>;
  reviewResultIds: string[];
};
export type ResearchResult = z.infer<typeof resultSchema>;
export type Task = {
  id: string;
  ownerId: string;
  kind: ResearchResult["kind"];
  templateVersion: 1;
  schemaVersion: 1;
  contextVersion: string;
  context: { holdings: Holding[]; decisions: Decision[] };
  from: string;
  to: string;
  createdAt: string;
  expiresAt: string;
  state: "pending" | "completed" | "cancelled";
  resultId: string | null;
  previousResultId: string | null;
};
export type SavedResult = {
  id: string;
  taskId: string;
  contextVersion: string;
  schemaVersion: 1;
  result: ResearchResult;
  idempotencyKey: string;
  contentHash: string;
  savedAt: string;
  previousResultId: string | null;
};
export type InvestmentState = {
  holdings: Holding[];
  decisions: Decision[];
  tasks: Task[];
  results: SavedResult[];
};
export const emptyState = (): InvestmentState => ({
  holdings: [],
  decisions: [],
  tasks: [],
  results: [],
});
