import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parseImportFile,
  csvCell,
  validateImportMetadata,
} from "../lib/imports";
const meta = {
  seriesId: "WGC_ETF_FLOW_GLOBAL_M",
  sourceUrl: "https://www.gold.org/goldhub/data",
  unit: "USD",
  statPeriodEnd: "2026-09-30",
  publishedAt: "2026-10-10T10:00:00Z",
};
describe("safe imports", () => {
  it("preserves statistical dates and decimal values with quoted mapped headers", async () => {
    const r = await parseImportFile(
      Buffer.from('"统计日期","金额"\r\n2026-09-30,-123.4500000001\r\n'),
      "report.csv",
      { dateColumn: "统计日期", valueColumn: "金额" },
    );
    expect(r.rows).toEqual([{ date: "2026-09-30", value: "-123.4500000001" }]);
  });
  it.each([
    "date,value\n2026-02-30,1",
    "date,value\n2026-09-30,NaN",
    "date,value\n2026-09-30,=1+1",
    "date,value\n2026-09-30,1\n2026-09-30,2",
  ])("rejects invalid/ambiguous data: %s", async (text) => {
    await expect(
      parseImportFile(Buffer.from(text), "report.csv"),
    ).rejects.toThrow();
  });
  it("rejects formulas in XLSX even with a cached numeric result", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("data");
    sheet.addRow(["date", "value"]);
    sheet.addRow(["2026-09-30", { formula: "1+1", result: 2 }]);
    await expect(
      parseImportFile(Buffer.from(await wb.xlsx.writeBuffer()), "report.xlsx"),
    ).rejects.toThrow();
  });
  it("reads normal XLSX dates without changing observation frequency", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("data");
    sheet.addRow(["date", "value"]);
    sheet.addRow([new Date("2026-09-30T00:00:00Z"), 123.45]);
    const r = await parseImportFile(
      Buffer.from(await wb.xlsx.writeBuffer()),
      "report.xlsx",
    );
    expect(r.rows).toEqual([{ date: "2026-09-30", value: "123.45" }]);
  });
  it("enforces filename, size, and formula-safe CSV export", async () => {
    await expect(
      parseImportFile(Buffer.alloc(2 * 1024 * 1024 + 1), "a.csv"),
    ).rejects.toThrow();
    await expect(
      parseImportFile(Buffer.from("date,value\n2026-09-30,1"), "../a.csv"),
    ).rejects.toThrow();
    expect(csvCell('=HYPERLINK("https://evil")')).toBe(
      '"\'=HYPERLINK(""https://evil"")"',
    );
  });
  it("requires official source provenance and matching unit", () => {
    expect(validateImportMetadata(meta).unit).toBe("USD");
    expect(() =>
      validateImportMetadata({
        ...meta,
        sourceUrl: "https://gold.org.evil.com/a",
      }),
    ).toThrow();
    expect(() => validateImportMetadata({ ...meta, unit: "tonnes" })).toThrow();
    expect(() =>
      validateImportMetadata({ ...meta, sourceUrl: "http://www.gold.org/a" }),
    ).toThrow();
  });
});

it.runIf(!!process.env.TEST_DATABASE_URL)(
  "commits once transactionally with durable provenance and owner-bound preview",
  async () => {
    const { readFile } = await import("node:fs/promises");
    const { database } = await import("../lib/db/client");
    const { previewImport, commitImport } = await import("../lib/imports");
    process.env.DATA_MODE = "live";
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const db = database();
    await db.unsafe(
      await readFile("../../db/migrations/0002_import_metadata.sql", "utf8"),
    );
    const data = Buffer.from("date,value\n1899-01-31,123.4567890123\n");
    let importId: string | undefined;
    try {
      const preview = await previewImport(data, "integration-test.csv", {
        seriesId: "WGC_ETF_FLOW_GLOBAL_M",
        sourceUrl: "https://www.gold.org/goldhub/data",
        unit: "USD",
        statPeriodEnd: "1899-01-31",
      });
      const result = await commitImport(preview.token);
      importId = result.id;
      expect(result.status).toBe("imported");
      expect(result.count).toBe(1);
      const [record] =
        await db`SELECT metadata,row_count,stat_period_end::text FROM data_imports WHERE id=${result.id}`;
      expect(record.metadata.unit).toBe("USD");
      expect(record.row_count).toBe(1);
      expect(record.stat_period_end).toBe("1899-01-31");
      const again = await previewImport(data, "integration-test.csv", {
        seriesId: "WGC_ETF_FLOW_GLOBAL_M",
        sourceUrl: "https://www.gold.org/goldhub/data",
        statPeriodEnd: "1899-01-31",
      });
      expect((await commitImport(again.token)).status).toBe("duplicate");
      await expect(commitImport(preview.token)).rejects.toThrow();
    } finally {
      if (importId) {
        await db`DELETE FROM metric_observations WHERE source_record_id=${importId}`;
        await db`DELETE FROM audit_logs WHERE resource_id=${importId}`;
        await db`DELETE FROM data_imports WHERE id=${importId}`;
      }
      process.env.DATA_MODE = "demo";
    }
  },
);

it("rejects oversized decompressed ZIP entries before workbook parsing", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("data");
  sheet.addRow(["date", "value"]);
  sheet.addRow(["2026-09-30", 1]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expect(central).toBeGreaterThan(0);
  bytes.writeUInt32LE(6 * 1024 * 1024, central + 24);
  await expect(parseImportFile(bytes, "big.xlsx")).rejects.toThrow();
});
it("rejects formula headers even when explicitly mapped", async () => {
  await expect(
    parseImportFile(Buffer.from("date,=danger\n2026-09-30,1"), "a.csv", {
      valueColumn: "=danger",
    }),
  ).rejects.toThrow();
});
