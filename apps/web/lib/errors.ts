export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorResponse(e: unknown) {
  const known = e instanceof AppError;
  return Response.json(
    {
      error: {
        code: known ? e.code : "SOURCE_UNAVAILABLE",
        message: known
          ? e.message
          : "服务暂时不可用，请检查数据库、配置或采集日志。",
        requestId: crypto.randomUUID(),
      },
    },
    {
      status: known ? e.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
