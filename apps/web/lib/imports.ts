import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import { seriesById } from "./catalog";
import { AppError } from "./errors";
import { database, demoMode } from "./db/client";
import { OWNER_ID } from "./auth/session";

const MAX_FILE = 2 * 1024 * 1024,
  MAX_ROWS = 10000,
  MAX_UNPACKED = 20 * 1024 * 1024;
const fail = (message: string): never => {
  throw new AppError("VALIDATION_ERROR", message);
};
export interface ImportRow {
  date: string;
  value: string;
}
export interface ImportMetadata {
  seriesId: string;
  sourceUrl: string;
  unit: string;
  statPeriodEnd: string;
  publishedAt: string | null;
}
export interface ImportPreview extends ImportMetadata {
  token: string;
  columns: string[];
  rows: ImportRow[];
  count: number;
  fileName: string;
  fileSha256: string;
  dateColumn: string;
  valueColumn: string;
  expiresAt: string;
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function validateImportMetadata(
  raw: Record<string, unknown>,
): ImportMetadata {
  const seriesId = String(raw.seriesId ?? ""),
    s = seriesById(seriesId),
    sourceUrl = String(raw.sourceUrl ?? "");
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return fail("来源 URL 无效");
  }
  const allowed = [
    "gold.org",
    "cftc.gov",
    "sge.com.cn",
    "fred.stlouisfed.org",
    "frankfurter.dev",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowed.some((h) => url.hostname === h || url.hostname.endsWith("." + h))
  )
    fail("仅允许官方 HTTPS 来源 URL");
  const expected =
    s.providerId === "wgc_import"
      ? "gold.org"
      : s.providerId === "fred"
        ? "fred.stlouisfed.org"
        : s.providerId === "cftc"
          ? "cftc.gov"
          : s.providerId === "frankfurter"
            ? "frankfurter.dev"
            : "";
  if (
    !expected ||
    !(url.hostname === expected || url.hostname.endsWith("." + expected)) ||
    !["imported", "observation"].includes(s.kind)
  )
    fail("来源与指标口径不匹配，不能导入报价或 OHLC");
  if (
    s.kind === "imported" &&
    !["WGC_ETF_FLOW_GLOBAL_M", "WGC_CB_HOLDINGS_M"].includes(s.id)
  )
    fail("未支持此导入指标");
  const unit = String(raw.unit ?? s.unit);
  if (unit !== s.unit) fail("导入单位与指标不一致");
  const statPeriodEnd = String(raw.statPeriodEnd ?? "");
  if (!validDate(statPeriodEnd)) fail("需要有效的统计截止日 statPeriodEnd");
  const publishedAt = raw.publishedAt ? String(raw.publishedAt) : null;
  if (
    publishedAt &&
    (!validDate(publishedAt.slice(0, 10)) ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(publishedAt) ||
      Number.isNaN(Date.parse(publishedAt)))
  )
    fail("发布日期必须是带时区的 ISO 时间，未知请留空");
  return {
    seriesId,
    sourceUrl: url.toString(),
    unit,
    statPeriodEnd,
    publishedAt,
  };
}

function inspectZip(buffer: Buffer) {
  // Read central directory first, then bound actual decompression as well; declared sizes alone are untrusted.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) fail("XLSX ZIP 结构无效");
  const count = buffer.readUInt16LE(eocd + 10),
    directorySize = buffer.readUInt32LE(eocd + 12),
    offset = buffer.readUInt32LE(eocd + 16);
  if (
    count > 2000 ||
    count === 65535 ||
    offset + directorySize > eocd ||
    buffer.readUInt16LE(eocd + 4) ||
    buffer.readUInt16LE(eocd + 6)
  )
    fail("不支持分卷/ZIP64 或过大的 XLSX");
  let at = offset,
    total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50)
      fail("XLSX ZIP 目录无效");
    const flags = buffer.readUInt16LE(at + 8),
      method = buffer.readUInt16LE(at + 10),
      compressed = buffer.readUInt32LE(at + 20),
      uncompressed = buffer.readUInt32LE(at + 24),
      nameLen = buffer.readUInt16LE(at + 28),
      extraLen = buffer.readUInt16LE(at + 30),
      commentLen = buffer.readUInt16LE(at + 32),
      local = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    if (
      names.has(name) ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").some((s) => s === "..") ||
      /vbaproject|macros?|externallinks|\.bin$/i.test(name)
    )
      fail("拒绝宏、外部链接、重复或危险 ZIP 路径");
    names.add(name);
    total += uncompressed;
    if (
      flags & (1 | 64 | 8192) ||
      ![0, 8].includes(method) ||
      uncompressed > 5 * 1024 * 1024 ||
      total > MAX_UNPACKED ||
      local + 30 > buffer.length ||
      buffer.readUInt32LE(local) !== 0x04034b50
    )
      fail("XLSX 内容过大、加密或压缩格式不支持");
    const localNameLength = buffer.readUInt16LE(local + 26);
    if (
      buffer.readUInt16LE(local + 8) !== method ||
      buffer
        .subarray(local + 30, local + 30 + localNameLength)
        .toString("utf8") !== name
    )
      fail("ZIP 本地记录与目录不一致");
    const start =
      local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    if (start + compressed > offset) fail("XLSX ZIP 记录越界");
    let content: Buffer;
    try {
      content =
        method === 0
          ? buffer.subarray(start, start + compressed)
          : inflateRawSync(buffer.subarray(start, start + compressed), {
              maxOutputLength: 5 * 1024 * 1024,
            });
    } catch {
      return fail("XLSX 解压失败或内容过大");
    }
    if (content.length !== uncompressed) fail("XLSX ZIP 大小不一致");
    if (
      /\.(?:xml|rels)$/i.test(name) &&
      (/<\s*(?:\w+:)?f(?:\s|>)/i.test(content.toString()) ||
        /<!DOCTYPE|<!ENTITY/i.test(content.toString()) ||
        /TargetMode\s*=\s*["']External["']/i.test(content.toString()))
    )
      fail("拒绝公式和外部关系");
    at += 46 + nameLen + extraLen + commentLen;
  }
  if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml"))
    fail("文件不是 XLSX 工作簿");
}
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const push = () => {
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 128) fail("最多128列");
  };
  const line = () => {
    push();
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) fail("最多10000行数据");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"') {
      if (field || closed) fail("CSV 引号格式无效");
      quoted = true;
    } else if (c === ",") push();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line();
    } else {
      if (closed && !/\s/.test(c)) fail("CSV 引号后存在非法内容");
      field += c;
    }
    if (field.length > 10000) fail("单元格过长");
  }
  if (quoted) fail("CSV 引号未闭合");
  if (field || row.length) line();
  return rows;
}
export async function parseImportFile(
  buffer: Buffer,
  fileName: string,
  mapping: { dateColumn?: string; valueColumn?: string } = {},
) {
  if (!buffer.length || buffer.length > MAX_FILE)
    fail("文件必须在2MB以内且非空");
  if (fileName.length > 200 || /[\\/\x00-\x1f]/.test(fileName))
    fail("文件名无效");
  let table: unknown[][];
  if (/\.csv$/i.test(fileName)) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return fail("CSV 必须采用 UTF-8 编码");
    }
    table = csvRows(text.replace(/^\uFEFF/, ""));
  } else if (/\.xlsx$/i.test(fileName)) {
    inspectZip(buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      return fail("无法解析 XLSX 工作簿");
    }
    if (workbook.worksheets.length !== 1)
      fail("请导入只含一个数据工作表的文件");
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 128)
      fail("最多10000行和128列");
    table = [];
    sheet.eachRow((row) => {
      const values: unknown[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const value = row.getCell(c).value;
        if (
          value !== null &&
          typeof value === "object" &&
          !(value instanceof Date)
        )
          fail("拒绝公式、富文本和复杂单元格");
        values.push(value ?? "");
      }
      table.push(values);
    });
  } else return fail("只支持 CSV 和 XLSX，拒绝 XLS/XLSM");
  if (table.length < 2) fail("文件没有数据行");
  const columns = table[0].map((v) => String(v).trim());
  if (
    columns.some((c) => !c || /^[=+@]/.test(c)) ||
    new Set(columns).size !== columns.length
  )
    fail("表头不能为空或重复");
  const dateColumn = mapping.dateColumn || "date",
    valueColumn = mapping.valueColumn || "value",
    di = columns.indexOf(dateColumn),
    vi = columns.indexOf(valueColumn);
  if (di < 0 || vi < 0 || di === vi)
    fail("找不到指定日期/数值列，请设置列映射");
  const seen = new Set<string>(),
    rows: ImportRow[] = [];
  for (const cells of table.slice(1)) {
    if (cells.every((c) => c === "" || c === null)) continue;
    if (cells.some((c) => typeof c === "string" && /^\s*[=+@]/.test(c)))
      fail("拒绝公式形式的单元格");
    const rawDate = cells[di],
      date =
        rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate ?? "").trim();
    if (!validDate(date) || seen.has(date))
      fail("日期无效或重复；请先整理每期唯一记录");
    seen.add(date);
    const value = String(cells[vi] ?? "").trim();
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))
      fail("数值必须为有限十进制数字");
    const decimal = new Decimal(value);
    if (
      !decimal.isFinite() ||
      decimal.decimalPlaces() > 10 ||
      decimal.abs().gte("100000000000000")
    )
      fail("数值超出数据库精度/范围");
    rows.push({ date, value: decimal.toFixed() });
    if (rows.length > MAX_ROWS) fail("最多10000行数据");
  }
  if (!rows.length) fail("没有有效数据行");
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { columns, rows, dateColumn, valueColumn };
}
const pending = new Map<string, ImportPreview>();
export async function previewImport(
  buffer: Buffer,
  fileName: string,
  raw: Record<string, unknown>,
) {
  const metadata = validateImportMetadata(raw),
    parsed = await parseImportFile(buffer, fileName, {
      dateColumn: raw.dateColumn ? String(raw.dateColumn) : undefined,
      valueColumn: raw.valueColumn ? String(raw.valueColumn) : undefined,
    });
  if (parsed.rows.at(-1)!.date > metadata.statPeriodEnd)
    fail("数据日期不能晚于统计截止日");
  const preview: ImportPreview = {
    ...metadata,
    ...parsed,
    token: randomUUID(),
    count: parsed.rows.length,
    fileName,
    fileSha256: createHash("sha256").update(buffer).digest("hex"),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  if (demoMode()) {
    for (const [key, value] of pending)
      if (Date.parse(value.expiresAt) < Date.now()) pending.delete(key);
    if (pending.size >= 20)
      throw new AppError(
        "SOURCE_RATE_LIMITED",
        "待确认预览过多，请稍后重试",
        429,
      );
    pending.set(preview.token, preview);
  } else {
    const s = seriesById(preview.seriesId);
    await database()`DELETE FROM provider_cache WHERE cache_key LIKE ${"import:" + OWNER_ID + ":%"} AND expires_at<now()`;
    await database()`INSERT INTO provider_cache(cache_key,provider_id,payload,expires_at) VALUES(${"import:" + OWNER_ID + ":" + preview.token},${s.providerId},${database().json(preview as never)},${preview.expiresAt})`;
  }
  return {
    ...preview,
    rows: preview.rows.slice(0, 20),
    isDemo: demoMode(),
    metadata: {
      ...metadata,
      dateColumn: parsed.dateColumn,
      valueColumn: parsed.valueColumn,
    },
  };
}
export async function commitImport(token: string) {
  if (demoMode())
    throw new AppError("FORBIDDEN", "Demo 只能预览，不能写入正式数据", 409);
  return database().begin(async (tx) => {
    const key = "import:" + OWNER_ID + ":" + token;
    const [cache] = await tx<
      { payload: ImportPreview }[]
    >`SELECT payload FROM provider_cache WHERE cache_key=${key} AND expires_at>now() FOR UPDATE`;
    if (!cache)
      throw new AppError(
        "VALIDATION_ERROR",
        "预览不存在或已过期，请重新上传",
        410,
      );
    const p = cache.payload,
      s = seriesById(p.seriesId);
    validateImportMetadata(p as unknown as Record<string, unknown>);
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${"atlas:series:" + s.id},0))`;
    const [existing] = await tx<
      { id: string }[]
    >`SELECT id FROM data_imports WHERE owner_id=${OWNER_ID} AND file_sha256=${p.fileSha256} AND dataset_type=${s.id}`;
    if (existing) {
      await tx`INSERT INTO audit_logs(id,owner_id,action,resource_id) VALUES(${randomUUID()},${OWNER_ID},'import.duplicate',${existing.id})`;
      await tx`DELETE FROM provider_cache WHERE cache_key=${key}`;
      return { id: existing.id, status: "duplicate", count: 0 };
    }
    const id = randomUUID();
    await tx`INSERT INTO data_imports(id,owner_id,provider_id,dataset_type,file_name,file_sha256,stat_period_end,released_at,row_count,status,source_url,metadata) VALUES(${id},${OWNER_ID},${s.providerId},${s.id},${p.fileName},${p.fileSha256},${p.statPeriodEnd},${p.publishedAt},${p.count},'imported',${p.sourceUrl},${tx.json({ unit: p.unit, seriesId: p.seriesId, dateColumn: p.dateColumn, valueColumn: p.valueColumn })})`;
    for (const row of p.rows)
      await tx`INSERT INTO metric_observations(series_id,period_date,value,published_at,provider_id,source_record_id,quality_flags) VALUES(${s.id},${row.date},${row.value},${p.publishedAt},${s.providerId},${id},'[]') ON CONFLICT(series_id,period_date,revision_id) DO UPDATE SET value=EXCLUDED.value,published_at=EXCLUDED.published_at,provider_id=EXCLUDED.provider_id,source_record_id=EXCLUDED.source_record_id,ingested_at=now()`;
    await tx`INSERT INTO audit_logs(id,owner_id,action,resource_id) VALUES(${randomUUID()},${OWNER_ID},'import.commit',${id})`;
    await tx`DELETE FROM provider_cache WHERE cache_key=${key}`;
    return { id, status: "imported", count: p.count };
  });
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text).replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
}
