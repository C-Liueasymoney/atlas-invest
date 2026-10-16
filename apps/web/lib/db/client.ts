import postgres from "postgres";
import { AppError } from "../errors";
let client: ReturnType<typeof postgres> | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new AppError(
      "SOURCE_NOT_CONFIGURED",
      "请设置 DATABASE_URL 并执行迁移",
      503,
    );
  return (client ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    connect_timeout: 5,
    idle_timeout: 20,
    onnotice: () => {},
  }));
}
export async function query<T extends object = Record<string, unknown>>(
  text: string,
  values: (string | number | boolean | null)[] = [],
): Promise<T[]> {
  return [...(await database().unsafe<T[]>(text, values))];
}
export const demoMode = () => process.env.DATA_MODE !== "live";
