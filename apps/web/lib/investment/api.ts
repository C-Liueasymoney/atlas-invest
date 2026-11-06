import { body, json } from "../api-helpers";
import { AppError } from "../errors";
import {
  createHolding,
  updateHolding,
  createDecision,
  updateDecision,
  createTask,
  getTask,
  getTaskStatus,
  getResult,
  cancelTask,
  submitResult,
  readWorkspace,
} from "./service";
// dispatch has already authenticated the browser owner and applied CSRF checks.
export async function investmentApi(request: Request, p: string[]) {
  if (p[0] !== "investment") return;
  const method = request.method,
    id = p[2],
    action = p[3];
  if (p.length === 1 && method === "GET") return json(await readWorkspace());
  if (p.length > 4) throw new AppError("NOT_FOUND", "研究接口不存在", 404);
  if (p[1] === "holdings" && !action) {
    if (method === "POST" && !id)
      return json(await createHolding(await body(request)), 201);
    if (method === "PUT" && id)
      return json(await updateHolding(id, await body(request)));
  }
  if (p[1] === "decisions" && !action) {
    if (method === "POST" && !id)
      return json(await createDecision(await body(request)), 201);
    if (method === "PUT" && id)
      return json(await updateDecision(id, await body(request)));
  }
  if (p[1] === "tasks") {
    if (!id && method === "POST")
      return json(await createTask(await body(request)), 201);
    if (id && !action && method === "GET") return json(await getTask(id));
    if (id && action === "status" && method === "GET")
      return json(await getTaskStatus(id));
    if (id && action === "cancel" && method === "POST")
      return json(await cancelTask(id));
  }
  if (p[1] === "results" && id && !action && method === "GET")
    return json(await getResult(id));
  if (p.length === 2 && p[1] === "restore" && method === "POST")
    return json(await submitResult(await body(request)));
  throw new AppError("NOT_FOUND", "研究接口不存在或不支持该操作", 404);
}
