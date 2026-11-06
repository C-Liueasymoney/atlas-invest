"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, json, useRemote } from "./api";
import type {
  Decision,
  Holding,
  InvestmentState,
  ResearchResult,
  SavedResult,
  Task,
} from "@/lib/investment/model";
import "./investment-workspace.css";
const base = "/api/v1/investment";
const labels: Record<ResearchResult["kind"], string> = {
  holding_analysis: "单项持仓体检",
  portfolio_analysis: "组合共同风险",
  events: "持仓事件课堂",
  decision_review: "决策复盘",
};
const states: Record<string, string> = {
  pending: "待执行",
  completed: "已保存",
  cancelled: "已撤销",
  expired: "已过期",
};
const assetLabels: Record<string, string> = {
  stock: "股票",
  fund: "基金",
  etf: "ETF",
  bond: "债券",
  gold: "黄金",
  cash: "现金",
  other: "其他",
};
const today = () => new Date().toISOString().slice(0, 10);
const formValues = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget));
function ErrorText({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="investment-error">
      {message}
    </p>
  ) : null;
}
function HoldingSnapshot({ holdings }: { holdings: Holding[] }) {
  return (
    <ul>
      {holdings.map((h) => (
        <li key={h.id}>
          <strong>{h.name}</strong> · {h.code || "代码待确认"} /{" "}
          {h.market || "市场待确认"} · {assetLabels[h.assetClass]} ·{" "}
          {h.amount.toLocaleString()}{" "}
          {h.sizing === "percent" ? "%" : h.currency} · 估值 {h.valuationDate} ·
          v{h.version}
          <br />
          <small>
            实际货币敞口：{h.exposureCurrency || "未知"}；投资范围：
            {h.investmentScope}；来源：{h.source}
          </small>
        </li>
      ))}
    </ul>
  );
}
function HoldingEditor({
  item,
  onDone,
}: {
  item?: Holding;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = formValues(event);
    setBusy(true);
    try {
      await api(
        base + "/holdings" + (item ? "/" + item.id : ""),
        json(item ? "PUT" : "POST", {
          ...d,
          amount: Number(d.amount),
          code: d.code || null,
          market: d.market || null,
          exposureCurrency: d.exposureCurrency || null,
          ...(item ? { expectedVersion: item.version } : {}),
        }),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="investment-form">
      <h2>{item ? "编辑持仓" : "登记真实持仓"}</h2>
      <p className="muted">
        按你已确认的信息登记。代码不明时留空，选择待确认。比例以整个真实组合为分母，市值保留原币种。
      </p>
      <div className="investment-fields">
        <label>
          名称
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={item?.name}
          />
        </label>
        <label>
          证券 / 基金代码
          <input name="code" maxLength={160} defaultValue={item?.code || ""} />
        </label>
        <label>
          市场 / 交易所
          <input
            name="market"
            maxLength={160}
            defaultValue={item?.market || ""}
          />
        </label>
        <label>
          身份状态
          <select
            name="identityStatus"
            defaultValue={item?.identityStatus || "unconfirmed"}
          >
            <option value="unconfirmed">待确认</option>
            <option value="confirmed">代码与市场已确认</option>
          </select>
        </label>
        <label>
          资产类别
          <select name="assetClass" defaultValue={item?.assetClass || "fund"}>
            {Object.entries(assetLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          计价币种
          <input
            name="currency"
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            defaultValue={item?.currency || "CNY"}
          />
        </label>
        <label>
          实际货币敞口（未知可留空）
          <input
            name="exposureCurrency"
            maxLength={160}
            defaultValue={item?.exposureCurrency || ""}
            placeholder="如 CNY、USD 或混合；以披露为准"
          />
        </label>
        <label>
          登记方式
          <select name="sizing" defaultValue={item?.sizing || "value"}>
            <option value="value">手动市值（原币种）</option>
            <option value="percent">占组合比例（%）</option>
          </select>
        </label>
        <label>
          数值
          <input
            name="amount"
            required
            type="number"
            min="0"
            step="any"
            defaultValue={item?.amount}
          />
        </label>
        <label>
          估值日期
          <input
            name="valuationDate"
            required
            type="date"
            defaultValue={item?.valuationDate || today()}
          />
        </label>
        <label>
          信息来源
          <input
            name="source"
            required
            maxLength={5000}
            defaultValue={item?.source || "手动登记"}
          />
        </label>
        <label>
          实际投资范围
          <textarea
            name="investmentScope"
            required
            maxLength={5000}
            defaultValue={item?.investmentScope || "待披露确认"}
          />
        </label>
      </div>
      <ErrorText message={error} />
      <div className="investment-actions">
        <button className="primary" disabled={busy}>
          {busy ? "保存中…" : "保存持仓"}
        </button>
        <button type="button" onClick={onDone}>
          关闭
        </button>
      </div>
    </form>
  );
}
function DecisionEditor({
  item,
  holdings,
  onDone,
}: {
  item?: Decision;
  holdings: Holding[];
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const d = Object.fromEntries(form);
    setBusy(true);
    try {
      await api(
        base + "/decisions" + (item ? "/" + item.id : ""),
        json(item ? "PUT" : "POST", {
          ...d,
          holdingIds: form.getAll("holdingIds"),
          ...(item ? { expectedVersion: item.version } : {}),
        }),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="investment-form">
      <h2>{item ? "修订决策" : "记录投资判断"}</h2>
      <p className="muted">保存原始理由与每次修订；AI 复盘以独立条目追加。</p>
      <fieldset>
        <legend>关联持仓</legend>
        {holdings.map((h) => (
          <label className="investment-check" key={h.id}>
            <input
              name="holdingIds"
              type="checkbox"
              value={h.id}
              defaultChecked={item?.holdingIds.includes(h.id)}
            />
            {h.name}
          </label>
        ))}
      </fieldset>
      <div className="investment-fields">
        {[
          ["rationale", "投资理由"],
          ["supportingEvidence", "支持证据"],
          ["falsification", "反证条件"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <textarea
              name={name}
              required
              maxLength={5000}
              defaultValue={item?.[name as "rationale"]}
            />
          </label>
        ))}
        <label>
          预计持有期限
          <input
            name="horizon"
            required
            maxLength={160}
            defaultValue={item?.horizon}
          />
        </label>
        <label>
          复查日期
          <input
            name="reviewDate"
            type="date"
            required
            defaultValue={item?.reviewDate || today()}
          />
        </label>
      </div>
      <ErrorText message={error} />
      <div className="investment-actions">
        <button disabled={busy} className="primary">
          保存判断
        </button>
        <button type="button" onClick={onDone}>
          关闭
        </button>
      </div>
    </form>
  );
}
export function InvestmentWorkspace() {
  const router = useRouter();
  const [initialFrom] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const remote = useRemote<
    Omit<InvestmentState, "tasks"> & {
      tasks: Array<Task & { status: string; contextChanged: boolean }>;
      agentUrl: string | null;
    }
  >(base);
  const [editor, setEditor] = useState<Holding | "new" | null>(null),
    [decisionEditor, setDecisionEditor] = useState<Decision | "new" | null>(
      null,
    ),
    [selected, setSelected] = useState<string[]>([]),
    [kind, setKind] = useState<ResearchResult["kind"]>("holding_analysis"),
    [decisionId, setDecisionId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const state = remote.data;
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = formValues(event);
    setBusy(true);
    setError("");
    try {
      const task = await api<Task>(
        base + "/tasks",
        json("POST", {
          ...d,
          kind,
          ...(kind === "decision_review"
            ? { decisionId }
            : { holdingIds: selected }),
        }),
      );
      router.push("/investments/tasks/" + task.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="investment-workspace">
      <div className="page-title">
        <div>
          <h1>持仓研究工作台</h1>
          <p className="muted">
            登记真实持仓，交给外部 AI 研究，再把证据与判断留在这里。
          </p>
        </div>
        <button onClick={remote.refresh}>刷新</button>
      </div>
      <ErrorText message={remote.error || error} />
      {state && <HoldingOverview holdings={state.holdings} />}
      <section className="panel investment-card">
        <h2>跨设备研究</h2>
        <p>
          创建固定快照任务 → 复制到已授权 Atlas 工具的 Codex / ChatGPT Work → AI
          联网研究并提交 → 本站查看结果。
        </p>
        {state?.agentUrl ? (
          <p>
            MCP 接入地址：<code>{state.agentUrl}</code>
            。已配置服务地址，客户端连接与授权状态需在各客户端核实。
          </p>
        ) : (
          <p>
            尚未配置远程工具地址。管理员需配置 ATLAS_AGENT_PUBLIC_URL
            并完成客户端接入；当前不能据此声称可自动写回。
          </p>
        )}
        <p className="muted">
          本站不调用模型。任务 ID
          不提供权限；复制任务显示待执行。格式校验不等于事实核验。
        </p>
      </section>
      {editor && (
        <section className="panel investment-card">
          <HoldingEditor
            key={editor === "new" ? "new" : editor.id}
            item={editor === "new" ? undefined : editor}
            onDone={() => {
              setEditor(null);
              remote.refresh();
            }}
          />
        </section>
      )}
      <section className="panel investment-card">
        <div className="investment-actions">
          <h2>真实持仓</h2>
          <button className="primary" onClick={() => setEditor("new")}>
            登记持仓
          </button>
        </div>
        {!state?.holdings.length ? (
          <p className="muted">
            尚未登记持仓。这里不会预填你的资产；现有模拟组合保持独立。
          </p>
        ) : (
          <div className="investment-list">
            {state.holdings.map((h) => (
              <article key={h.id}>
                <div className="investment-actions">
                  <label className="investment-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(h.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, h.id]
                            : selected.filter((id) => id !== h.id),
                        )
                      }
                    />
                    <strong>{h.name}</strong>
                  </label>
                  <button onClick={() => setEditor(h)}>编辑</button>
                </div>
                <HoldingSnapshot holdings={[h]} />
                <span className="muted">
                  {h.identityStatus === "confirmed"
                    ? "代码已确认"
                    : "代码待确认，研究不得精确穿透"}
                </span>
                {h.revisions.length > 0 && (
                  <details>
                    <summary>持仓修订历史（{h.revisions.length}）</summary>
                    {h.revisions.map((r) => (
                      <p key={r.version}>
                        v{r.version} · {r.data.name} · {r.data.amount}{" "}
                        {r.data.sizing === "percent" ? "%" : r.data.currency} ·{" "}
                        {r.savedAt}
                      </p>
                    ))}
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {decisionEditor && (
        <section className="panel investment-card">
          <DecisionEditor
            key={decisionEditor === "new" ? "new" : decisionEditor.id}
            holdings={state?.holdings || []}
            item={decisionEditor === "new" ? undefined : decisionEditor}
            onDone={() => {
              setDecisionEditor(null);
              remote.refresh();
            }}
          />
        </section>
      )}
      <section className="panel investment-card">
        <div className="investment-actions">
          <h2>决策与复盘</h2>
          <button
            disabled={!state?.holdings.length}
            onClick={() => setDecisionEditor("new")}
          >
            记录判断
          </button>
        </div>
        {!state?.decisions.length && (
          <p className="muted">
            写下理由、支持证据和反证条件，复盘时能看到最初的判断。
          </p>
        )}
        {state?.decisions.map((d) => (
          <article key={d.id}>
            <h3>{d.rationale}</h3>
            <p>支持证据：{d.supportingEvidence}</p>
            <p>反证条件：{d.falsification}</p>
            <p>
              预计期限：{d.horizon} · 复查：{d.reviewDate} · v{d.version}
            </p>
            <details>
              <summary>原始判断及修订历史</summary>
              <p>原始理由：{d.original.rationale}</p>
              <p>原始证据：{d.original.supportingEvidence}</p>
              <p>原始反证：{d.original.falsification}</p>
              {d.revisions.map((r) => (
                <p key={r.version}>
                  v{r.version} · {r.data.rationale} · {r.savedAt}
                </p>
              ))}
            </details>
            <div className="investment-actions">
              <button onClick={() => setDecisionEditor(d)}>修订判断</button>
              <button
                onClick={() => {
                  setKind("decision_review");
                  setDecisionId(d.id);
                  document
                    .getElementById("investment-create-task")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                复盘这次判断
              </button>
              {d.reviewResultIds.map((id) => (
                <Link key={id} href={"/investments/results/" + id}>
                  查看复盘
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="panel investment-card" id="investment-create-task">
        <h2>创建研究任务</h2>
        <form onSubmit={start}>
          <div className="investment-fields">
            <label>
              研究模板
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                {Object.entries(labels).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {kind === "decision_review" && (
              <label>
                原始决策
                <select
                  required
                  value={decisionId}
                  onChange={(e) => setDecisionId(e.target.value)}
                >
                  <option value="">选择决策</option>
                  {state?.decisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.rationale.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              研究开始
              <input
                type="date"
                name="from"
                required
                defaultValue={initialFrom}
              />
            </label>
            <label>
              研究截至
              <input type="date" name="to" required defaultValue={today()} />
            </label>
          </div>
          <p className="muted">
            {kind === "decision_review"
              ? "由服务器在创建时读取所选决策当前关联的全部持仓与原始判断；再次复盘沿用同一决策的研究历史。"
              : `使用上方勾选的 ${selected.length} 项持仓${kind === "holding_analysis" ? "（单项分析只选1项）" : ""}。`}
            任务固定快照并保留7天；影响因素采用定性分类，不作为收益或估值计算。
          </p>
          <button
            className="primary"
            disabled={busy || !state?.holdings.length}
          >
            {busy ? "创建中…" : "创建任务并查看复制指令"}
          </button>
        </form>
      </section>
      <section className="panel investment-card">
        <h2>研究历史</h2>
        {!state?.tasks.length && (
          <p className="muted">
            尚无任务。创建后可在另一台设备使用相同登录查看。
          </p>
        )}
        {state?.tasks.map((t) => (
          <article key={t.id}>
            <Link href={"/investments/tasks/" + t.id}>
              {labels[t.kind]} · {t.from} 至 {t.to}
            </Link>
            <p>
              {states[t.status]} · {t.createdAt}
              {t.contextChanged && " · 基于较早持仓或决策"}
            </p>
            {t.resultId && (
              <Link href={"/investments/results/" + t.resultId}>
                查看研究结果
              </Link>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
type TaskView = {
  task: Task;
  status: string;
  contextChanged: boolean;
  prompt: string;
  resultSchema: Record<string, unknown>;
  receipt: { resultId: string; resultUrl: string } | null;
};
export function InvestmentTask({ id }: { id: string }) {
  const router = useRouter();
  const remote = useRemote<TaskView>(base + "/tasks/" + id),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [restoring, setRestoring] = useState(false);
  const value = remote.data;
  const refresh = remote.refresh;
  useEffect(() => {
    if (value?.status !== "pending") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [value?.status, refresh]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value!.prompt);
      setMessage(
        "已复制。请粘贴到已连接 Atlas 工具的 AI 会话；任务仍为待执行。",
      );
    } catch {
      setMessage("自动复制失败，请在下方选中完整指令手动复制。");
    }
  }
  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestoring(true);
    try {
      const text = new FormData(event.currentTarget).get("payload") as string;
      await api(base + "/restore", json("POST", JSON.parse(text)));
      setMessage("已保存并核实回执。");
      remote.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }
  return (
    <div className="investment-workspace">
      <Link href="/investments">← 持仓研究</Link>
      <h1>{value ? labels[value.task.kind] : "研究任务"}</h1>
      <ErrorText message={remote.error || error} />
      {value && (
        <>
          <section className="panel investment-card">
            <h2>{states[value.status]}</h2>
            <p>
              任务 {id} · 有效至 {value.task.expiresAt}
            </p>
            <p>
              研究期间 {value.task.from} 至 {value.task.to}
            </p>
            {value.contextChanged && (
              <p className="investment-warning">
                基于较早持仓或决策：创建任务后资料已变化，本任务仍只使用下方固定快照。
              </p>
            )}
            <HoldingSnapshot holdings={value.task.context.holdings} />
            {value.task.context.decisions.map((d) => (
              <div key={d.id}>
                <h3>固定决策 v{d.version}</h3>
                <p>最初理由：{d.original.rationale}</p>
                <p>任务时理由：{d.rationale}</p>
                <p>支持证据：{d.supportingEvidence}</p>
                <p>反证条件：{d.falsification}</p>
                <p>
                  期限：{d.horizon} · 复查：{d.reviewDate}
                </p>
              </div>
            ))}
            <div className="investment-actions">
              <button onClick={remote.refresh}>刷新状态</button>
              {value.status === "pending" && (
                <>
                  <button className="primary" onClick={copy}>
                    复制 AI 指令
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await api(
                          base + "/tasks/" + id + "/cancel",
                          json("POST"),
                        );
                        remote.refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    撤销任务
                  </button>
                </>
              )}
              {value.receipt && (
                <Link href={"/investments/results/" + value.receipt.resultId}>
                  打开已保存结果
                </Link>
              )}
              <button
                title="复盘重新读取该决策当前关联的持仓；其他研究保留原任务持仓集合并读取最新资料"
                onClick={async () => {
                  try {
                    const t = await api<Task>(
                      base + "/tasks",
                      json("POST", {
                        kind: value.task.kind,
                        from: value.task.from,
                        to: value.task.to,
                        ...(value.task.kind === "decision_review"
                          ? { decisionId: value.task.context.decisions[0].id }
                          : {
                              holdingIds: value.task.context.holdings.map(
                                (h) => h.id,
                              ),
                            }),
                        ...(value.task.resultId
                          ? { previousResultId: value.task.resultId }
                          : {}),
                      }),
                    );
                    router.push("/investments/tasks/" + t.id);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                基于当前资料重新研究
              </button>
            </div>
            <p role="status">{message}</p>
            <label>
              完整 AI 指令
              <textarea
                className="investment-prompt"
                readOnly
                value={value.prompt}
                onFocus={(e) => e.target.select()}
              />
            </label>
          </section>
          <section className="panel investment-card">
            <h2>恢复结果</h2>
            <p>
              工具暂时不可用时，粘贴 AI 保留的完整提交
              JSON（taskId、schemaVersion、contextVersion、result、idempotencyKey）。恢复与工具使用相同校验、状态和幂等规则。
            </p>
            <form onSubmit={restore}>
              <textarea
                name="payload"
                required
                aria-label="恢复提交 JSON"
                placeholder="粘贴完整 JSON"
              />
              <button disabled={restoring}>校验并恢复保存</button>
            </form>
            <details>
              <summary>查看任务要求的结果 JSON Schema</summary>
              <pre>{JSON.stringify(value.resultSchema, null, 2)}</pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
export function InvestmentResult({ id }: { id: string }) {
  const remote = useRemote<{
    saved: SavedResult;
    task: Task;
    contextChanged: boolean;
    resultUrl: string;
  }>(base + "/results/" + id);
  const value = remote.data,
    r = value?.saved.result;
  return (
    <div className="investment-workspace">
      <Link href="/investments">← 持仓研究</Link>
      <h1>研究结果</h1>
      <ErrorText message={remote.error} />
      {value && r && (
        <>
          <section className="panel investment-card">
            <p className="muted">
              AI 生成 · 截至 {r.asOf} · 保存 {value.saved.savedAt} ·
              格式校验不代表事实核验
            </p>
            <h2>{labels[r.kind]}</h2>
            <p>{r.summary}</p>
            {value.contextChanged && (
              <p className="investment-warning">
                基于较早持仓或决策。研究期间资料已变化，请核对固定快照，必要时重新研究。
              </p>
            )}
            <p>
              研究期间：{value.task.from} 至 {value.task.to} · 上下文{" "}
              {value.saved.contextVersion.slice(0, 12)}
            </p>
            <HoldingSnapshot holdings={value.task.context.holdings} />
            <div className="investment-actions">
              <Link href={"/investments/tasks/" + value.task.id}>
                任务、固定决策与重新研究
              </Link>
              {value.saved.previousResultId && (
                <Link
                  href={"/investments/results/" + value.saved.previousResultId}
                >
                  上一次结果
                </Link>
              )}
            </div>
          </section>
          <section className="panel investment-card">
            <h2>事实与证据</h2>
            {r.facts.length ? (
              r.facts.map((f) => (
                <article key={f.id}>
                  <p>{f.text}</p>
                  <SourceRefs ids={f.sourceIds} sources={r.sources} />
                </article>
              ))
            ) : (
              <p>未获得可引用的事实；请结合资料限制阅读。</p>
            )}
          </section>
          <section className="panel investment-card">
            <h2>可能的影响机制</h2>
            <p className="muted">
              定性因素分类与条件解释，不能据此确认因果或预测收益。
            </p>
            {r.mechanisms.map((m, i) => (
              <article key={i}>
                <h3>
                  {i + 1}. {m.title}
                </h3>
                <p>{m.explanation}</p>
                <p>成立条件：{m.conditions}</p>
                <p>相反 / 抵消因素：{m.counterFactors}</p>
                <p>
                  关联持仓：{names(m.holdingIds, value.task)}；证据：
                  {m.factIds
                    .map((id) => r.facts.find((f) => f.id === id)?.text)
                    .join("；") || "尚无直接证据"}
                </p>
              </article>
            ))}
          </section>
          <section className="panel investment-card">
            <h2>持仓事件课堂</h2>
            {!r.events.length && (
              <p className="muted">本次未记录已核实的重要事件。</p>
            )}
            {r.events.map((e, i) => (
              <article key={i}>
                <h3>{e.title}</h3>
                <p>
                  事件日期：
                  {e.eventDate
                    ? e.datePrecision === "year"
                      ? e.eventDate.slice(0, 4)
                      : e.datePrecision === "month"
                        ? e.eventDate.slice(0, 7)
                        : e.eventDate
                    : "未知"}
                  （
                  {
                    { day: "日", month: "月", year: "年", unknown: "未知" }[
                      e.datePrecision
                    ]
                  }
                  精度）；发布时间：{e.publishedAt || "未知"}
                </p>
                <p>{e.explanation}</p>
                <p>关联持仓：{names(e.holdingIds, value.task)}</p>
                <p>学习概念：{e.concept}</p>
                <SourceRefs ids={e.sourceIds} sources={r.sources} />
              </article>
            ))}
          </section>
          <section className="panel investment-card">
            <h2>下一步观察</h2>
            {r.observations.map((o, i) => (
              <article key={i}>
                <p>{o.text}</p>
                <p>
                  关联持仓：{names(o.holdingIds, value.task)}；影响因素：
                  {o.mechanismIndexes
                    .map((j) => r.mechanisms[j].title)
                    .join("、") || "未指定"}
                </p>
                <SourceRefs ids={o.sourceIds} sources={r.sources} />
              </article>
            ))}
          </section>
          {r.review && (
            <section className="panel investment-card">
              <h2>追加复盘</h2>
              {value.task.context.decisions.map((d) => (
                <div key={d.id}>
                  <p>最初判断：{d.original.rationale}</p>
                  <p>原始支持证据：{d.original.supportingEvidence}</p>
                  <p>原始反证条件：{d.original.falsification}</p>
                </div>
              ))}
              <p>证据变化：{r.review.evidenceChanges}</p>
              <p>反向证据：{r.review.counterEvidence}</p>
              <p>未解决问题：{r.review.unresolved}</p>
            </section>
          )}
          <section className="panel investment-card">
            <h2>不确定性与资料覆盖</h2>
            <ul>
              {r.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <h2>来源</h2>
            {r.sources.map((s) => (
              <article key={s.id} id={"source-" + s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                <p>
                  {s.publisher} · 发布：{s.publishedAt || "未知"} · 检索：
                  {s.retrievedAt}
                </p>
                <p>
                  覆盖：{s.coverage} · 获取范围：
                  {
                    { full: "全文", partial: "部分内容", summary: "仅摘要" }[
                      s.access
                    ]
                  }
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
function names(ids: string[], task: Task) {
  return (
    ids
      .map((id) => task.context.holdings.find((h) => h.id === id)?.name || id)
      .join("、") || "整体 / 未指定"
  );
}
function SourceRefs({
  ids,
  sources,
}: {
  ids: string[];
  sources: ResearchResult["sources"];
}) {
  return (
    <div className="investment-source-refs">
      {ids.map((id) => (
        <a
          href={sources.find((s) => s.id === id)?.url}
          target="_blank"
          rel="noopener noreferrer"
          key={id}
        >
          {sources.find((s) => s.id === id)?.title || id}
        </a>
      ))}
    </div>
  );
}
function HoldingOverview({ holdings }: { holdings: Holding[] }) {
  const values: Record<string, number> = {},
    weights: Record<string, number> = {};
  let known = 0,
    weight = 0;
  for (const h of holdings) {
    if (h.identityStatus === "confirmed") known++;
    if (h.sizing === "value")
      values[h.currency] = (values[h.currency] || 0) + h.amount;
    else {
      weights[h.assetClass] = (weights[h.assetClass] || 0) + h.amount;
      weight += h.amount;
    }
  }
  return (
    <section className="panel investment-card">
      <h2>登记概览</h2>
      <p>
        共 {holdings.length} 项持仓，代码与市场已确认 {known} 项；待确认{" "}
        {holdings.length - known} 项。
      </p>
      <div className="investment-fields">
        <div>
          <h3>手动市值 · 按原币种</h3>
          {Object.entries(values).map(([currency, value]) => (
            <p key={currency}>
              {currency}：
              {value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
            </p>
          ))}
          {!Object.keys(values).length && <p className="muted">尚无市值登记</p>}
        </div>
        <div>
          <h3>手动比例 · 按资产类别</h3>
          {Object.entries(weights).map(([asset, value]) => (
            <p key={asset}>
              {assetLabels[asset]}：
              {value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%
            </p>
          ))}
          {!Object.keys(weights).length && (
            <p className="muted">尚无比例登记</p>
          )}
        </div>
      </div>
      <p className="muted">
        各项使用所登记的估值日期；不同币种不相加。市值与比例登记不互相换算。已登记比例合计{" "}
        {weight.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%，
        {weight === 100
          ? "比例合计为100%仍需核对持仓范围与日期"
          : "覆盖未确认为完整组合"}
        。此处不计算账户收益或精确穿透。
      </p>
    </section>
  );
}
