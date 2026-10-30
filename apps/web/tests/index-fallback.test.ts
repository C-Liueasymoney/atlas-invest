import { expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
vi.mock("@/lib/providers/controller", () => ({ controlled: vi.fn() }));
vi.mock("@/lib/data", () => ({
  quote: vi.fn(async () => ({ value: null })),
  seriesData: vi.fn(async () => ({ points: [] })),
}));
import { controlled } from "@/lib/providers/controller";
import { latestIndex } from "@/lib/latest-index";
it("keeps the primary rate-limit reason when the optional backup is disabled", async () => {
  const previous = process.env.DATA_MODE;
  process.env.DATA_MODE = "preview";
  vi.mocked(controlled)
    .mockRejectedValueOnce(
      new AppError(
        "SOURCE_RATE_LIMITED",
        "本地请求预算已耗尽，等待窗口恢复",
        429,
      ),
    )
    .mockRejectedValueOnce(
      new AppError("SOURCE_UNAVAILABLE", "数据源已停用", 503),
    );
  try {
    const result = await latestIndex("FRED_SP500", true);
    expect(result.message).toContain("请求预算已耗尽");
    expect(result.message).not.toContain("数据源已停用");
  } finally {
    if (previous === undefined) delete process.env.DATA_MODE;
    else process.env.DATA_MODE = previous;
  }
});
