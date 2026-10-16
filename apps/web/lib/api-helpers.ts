import { z } from "zod";
import { AppError } from "./errors";
export async function body(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 2 * 1024 * 1024)
    throw new AppError("VALIDATION_ERROR", "请求超过2MB", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 2 * 1024 * 1024)
    throw new AppError("VALIDATION_ERROR", "请求超过2MB", 413);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new AppError("VALIDATION_ERROR", "JSON 格式错误");
  }
}
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const p = schema.safeParse(data);
  if (!p.success)
    throw new AppError(
      "VALIDATION_ERROR",
      p.error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; ")
        .slice(0, 400),
    );
  return p.data;
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !isNaN(Date.parse(s)), "日期无效");
