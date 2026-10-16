import { randomUUID } from "node:crypto";
import { z } from "zod";
import { body, parse, json } from "./api-helpers";
import { AppError } from "./errors";
import { workspace } from "./db/workspace";
import { seriesById } from "./catalog";
import { seriesData, quote } from "./data";
import { previewImport, commitImport, csvCell, validDate } from "./imports";
import { audit } from "./providers/repository";
import type { Note } from "./types";

const noteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  markdown: z.string().max(100000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  seriesIds: z.array(z.string().max(100)).max(30).default([]),
  eventDate: z.string().refine(validDate, "统计日期无效").nullable().optional(),
});
function verifySeries(ids: string[]) {
  for (const id of ids) seriesById(id);
}
async function form(request: Request) {
  const limit = 2 * 1024 * 1024 + 65536;
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new AppError("VALIDATION_ERROR", "上传请求超过2MB文件上限", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("VALIDATION_ERROR", "缺少上传文件");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError("VALIDATION_ERROR", "上传请求超过2MB文件上限", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new AppError("VALIDATION_ERROR", "multipart 文件上传格式无效");
  }
}
export async function researchApi(
  request: Request,
  p: string[],
  url: URL,
): Promise<Response | undefined> {
  const method = request.method;
  if (p[0] === "research") {
    if (p.length === 1 && method === "GET")
      return json({
        items: await workspace((s) =>
          s.notes.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        ),
      });
    if (p.length === 1 && method === "POST") {
      const d = parse(noteSchema, await body(request));
      verifySeries(d.seriesIds);
      const created = await workspace((s) => {
        const n: Note = {
          id: randomUUID(),
          ...d,
          tags: [...new Set(d.tags)],
          seriesIds: [...new Set(d.seriesIds)],
          updatedAt: new Date().toISOString(),
        };
        s.notes.push(n);
        return n;
      }, true);
      await audit("research.create", created.id);
      return json(created, 201);
    }
    if (p.length === 2 && ["GET", "PATCH", "DELETE"].includes(method)) {
      const id = parse(z.uuid(), p[1]);
      const patch =
        method === "PATCH"
          ? parse(noteSchema.partial(), await body(request))
          : undefined;
      if (patch?.seriesIds) verifySeries(patch.seriesIds);
      const result = await workspace((s) => {
        const n = s.notes.find((n) => n.id === id);
        if (!n) throw new AppError("NOT_FOUND", "研究笔记不存在", 404);
        if (method === "DELETE") {
          s.notes = s.notes.filter((n) => n.id !== id);
          return { deleted: true, id };
        }
        if (patch) {
          Object.assign(n, patch, { updatedAt: new Date().toISOString() });
          if (patch.tags) n.tags = [...new Set(patch.tags)];
          if (patch.seriesIds) n.seriesIds = [...new Set(patch.seriesIds)];
        }
        return n;
      }, method !== "GET");
      if (method !== "GET") await audit("research." + method.toLowerCase(), id);
      return json(result);
    }
  }
  if (p[0] === "imports" && p.length === 2 && method === "POST") {
    if (p[1] === "preview") {
      const data = await form(request),
        file = data.get("file");
      if (
        !file ||
        typeof file === "string" ||
        typeof file.arrayBuffer !== "function"
      )
        throw new AppError("VALIDATION_ERROR", "请选择 CSV/XLSX 文件");
      const fields: Record<string, unknown> = {};
      for (const [key, value] of data.entries()) {
        if (key === "file") continue;
        if (typeof value !== "string" || value.length > 2000)
          throw new AppError("VALIDATION_ERROR", "导入字段无效");
        fields[key] = value;
      }
      if (file.size > 2 * 1024 * 1024)
        throw new AppError("VALIDATION_ERROR", "文件超过2MB", 413);
      const result = await previewImport(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        fields,
      );
      await audit("import.preview", result.token);
      return json(result);
    }
    if (p[1] === "commit") {
      const d = parse(
        z.object({ token: z.uuid(), confirm: z.literal(true) }),
        await body(request),
      );
      return json(await commitImport(d.token));
    }
  }
  if (p[0] === "export" && p.length === 1 && method === "GET") {
    const id = parse(
        z.string().min(1).max(100),
        url.searchParams.get("seriesId"),
      ),
      format = parse(
        z.enum(["json", "csv"]),
        url.searchParams.get("format") ?? "json",
      );
    const s = seriesById(id);
    const data =
      s.kind === "quote" || s.kind === "derived"
        ? await quote(id)
        : await seriesData(id);
    const points =
      "points" in data
        ? data.points
        : [{ time: data.asOf ?? "", value: data.value }];
    if (format === "json")
      return json({ ...data, points, exportedAt: new Date().toISOString() });
    const headers = [
      "seriesId",
      "time",
      "value",
      "open",
      "high",
      "low",
      "close",
      "volume",
      "unit",
      "sourceId",
      "sourceUrl",
      "asOf",
      "fetchedAt",
      "status",
      "isDemo",
    ];
    const rows = points.map((point) => {
      const o = point as unknown as Record<string, unknown>;
      return [
        id,
        o.time,
        o.value,
        o.open,
        o.high,
        o.low,
        o.close,
        o.volume,
        data.unit,
        data.source.id,
        data.source.url,
        data.asOf,
        data.fetchedAt,
        data.status,
        data.isDemo,
      ]
        .map(csvCell)
        .join(",");
    });
    return new Response(
      "\uFEFF" +
        headers.map(csvCell).join(",") +
        "\r\n" +
        rows.join("\r\n") +
        "\r\n",
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  return undefined;
}
