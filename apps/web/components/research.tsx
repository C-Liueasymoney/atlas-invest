"use client";
import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { api, dateTime, json, Series, useRemote } from "./api";
import {
  ActionFeedback,
  Empty,
  ErrorNotice,
  Modal,
  PageHeading,
  useAction,
} from "./ui";
type Note = {
  id: string;
  title: string;
  markdown: string;
  tags: string[];
  seriesIds: string[];
  eventDate?: string;
  createdAt?: string;
  updatedAt?: string;
};
export function ResearchPage() {
  const remote = useRemote<{ items: Note[] }>("/api/v1/research");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tags, setTags] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [showImport, setShowImport] = useState(false);
  const action = useAction();
  const note =
    remote.data?.items.find((n) => n.id === selected) || remote.data?.items[0];
  function edit(n?: Note) {
    setSelected(n?.id || "");
    setTitle(n?.title || "");
    setMarkdown(n?.markdown || "");
    setTags(n?.tags.join(", ") || "");
    setEventDate(n?.eventDate?.slice(0, 10) || "");
    setEditing(true);
  }
  return (
    <>
      <PageHeading
        eyebrow="BUILD YOUR OWN THESIS"
        title="研究笔记"
        description="记录假设、证据和待验证的问题，留下可回看的思考。"
        actions={
          <>
            <button onClick={() => setShowImport(true)}>
              <Upload size={15} />
              导入数据
            </button>
            <button className="primary" onClick={() => edit()}>
              <Plus size={15} />
              新建笔记
            </button>
          </>
        }
      />
      <ErrorNotice message={remote.error} retry={remote.refresh} />
      <ActionFeedback action={action} />
      <div className="research-layout">
        <aside className="panel">
          <h2>
            <BookOpen size={15} style={{ display: "inline", marginRight: 8 }} />
            我的研究
          </h2>
          {remote.data?.items.map((n) => (
            <button
              className={`note-item ${note?.id === n.id ? "selected" : ""}`}
              key={n.id}
              onClick={() => setSelected(n.id)}
            >
              <strong>{n.title}</strong>
              <small>
                {n.eventDate?.slice(0, 10) ||
                  dateTime(n.updatedAt || n.createdAt)}
              </small>
            </button>
          ))}
          {remote.data?.items.length === 0 && (
            <Empty>第一篇研究，从一个问题开始。</Empty>
          )}
        </aside>
        <section className="panel">
          {note ? (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{note.title}</h2>
                  <p>
                    {note.tags.map((t) => `#${t}`).join(" ")}{" "}
                    {note.eventDate &&
                      ` · 事件日期 ${note.eventDate.slice(0, 10)}`}
                  </p>
                </div>
                <div className="actions">
                  <button onClick={() => edit(note)}>编辑</button>
                  <button
                    className="icon-button danger"
                    aria-label="删除研究笔记"
                    onClick={() => {
                      if (window.confirm("确认删除这篇研究笔记？"))
                        void action.run(async () => {
                          await api(
                            `/api/v1/research/${note.id}`,
                            json("DELETE"),
                          );
                          setSelected("");
                          remote.refresh();
                        }, "笔记已删除");
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <pre className="note-body">{note.markdown}</pre>
              <p className="small muted">
                笔记以安全的纯文本 Markdown 源文保存与展示，支持导出前继续编辑。
              </p>
            </>
          ) : (
            <Empty>创建一篇笔记，记录你的研究线索。</Empty>
          )}
        </section>
      </div>
      {editing && (
        <Modal
          title={selected ? "编辑研究笔记" : "新建研究笔记"}
          onClose={() => setEditing(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api(
                  selected
                    ? `/api/v1/research/${selected}`
                    : "/api/v1/research",
                  json(selected ? "PATCH" : "POST", {
                    title,
                    markdown,
                    tags: tags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                    seriesIds: [],
                    ...(eventDate ? { eventDate } : {}),
                  }),
                );
                setEditing(false);
                remote.refresh();
              }, "研究笔记已保存");
            }}
          >
            <label>
              标题
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：实际利率与黄金的背离"
              />
            </label>
            <label>
              研究内容（Markdown）
              <textarea
                required
                rows={10}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder="## 核心假设\n\n## 支持证据\n\n## 反例与风险"
              />
            </label>
            <div className="form-grid">
              <label>
                标签（英文逗号分隔）
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="黄金, 实际利率"
                />
              </label>
              <label>
                关联事件日期
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </label>
            </div>
            <button className="primary" disabled={action.busy}>
              <Save size={15} />
              保存笔记
            </button>
            <ActionFeedback action={action} />
          </form>
        </Modal>
      )}
      {showImport && (
        <Modal title="导入可信来源数据" onClose={() => setShowImport(false)}>
          <DataImport />
        </Modal>
      )}
    </>
  );
}
export function DataImport() {
  const catalog = useRemote<{ items: Series[] }>("/api/v1/catalog");
  const [seriesId, setSeriesId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [statPeriodEnd, setStatPeriodEnd] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [unit, setUnit] = useState("");
  const [dateColumn, setDateColumn] = useState("date");
  const [valueColumn, setValueColumn] = useState("value");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<{
    token: string;
    columns: string[];
    rows: Record<string, unknown>[];
    count: number;
    fileName: string;
  }>();
  const action = useAction();
  return (
    <>
      <p className="muted small">
        仅导入你有权使用的 CSV / XLSX（不超过 2 MB、10,000
        行，单工作表，不支持公式/宏）。来源需为对应官方 HTTPS
        链接，统计期结束日期须覆盖所有观测。Demo 可预览，正式写入需真实数据库。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          const data = new FormData();
          data.set("file", file);
          data.set("seriesId", seriesId);
          data.set("sourceUrl", sourceUrl);
          data.set("dateColumn", dateColumn);
          data.set("valueColumn", valueColumn);
          data.set("statPeriodEnd", statPeriodEnd);
          if (publishedAt)
            data.set("publishedAt", new Date(publishedAt).toISOString());
          if (unit) data.set("unit", unit);
          void action.run(
            async () =>
              setPreview(
                await api("/api/v1/imports/preview", {
                  method: "POST",
                  body: data,
                }),
              ),
            "预览已生成，请核对后确认",
          );
        }}
      >
        <label>
          目标指标
          <select
            required
            value={seriesId}
            onChange={(e) => {
              setSeriesId(e.target.value);
              setPreview(undefined);
            }}
          >
            <option value="">请选择已注册的目标指标</option>
            {catalog.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameZh} · {s.unit}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            统计期结束日期
            <input
              required
              type="date"
              value={statPeriodEnd}
              onChange={(e) => setStatPeriodEnd(e.target.value)}
            />
          </label>
          <label>
            原始发布日期时间（可选）
            <input
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
            />
          </label>
        </div>
        <label>
          数据单位（留空使用目标指标单位）
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={
              catalog.data?.items.find((s) => s.id === seriesId)?.unit ||
              "先选择目标指标"
            }
          />
        </label>
        <label>
          原始来源链接
          <input
            required
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://官方来源/文件说明"
          />
        </label>
        <label>
          数据文件
          <input
            required
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setPreview(undefined);
            }}
          />
        </label>
        <div className="form-grid">
          <label>
            日期列名
            <input
              required
              value={dateColumn}
              onChange={(e) => setDateColumn(e.target.value)}
            />
          </label>
          <label>
            数值列名
            <input
              required
              value={valueColumn}
              onChange={(e) => setValueColumn(e.target.value)}
            />
          </label>
        </div>
        <button disabled={action.busy}>
          <CalendarDays size={14} />
          解析并预览
        </button>
      </form>
      {preview && (
        <section className="form-section">
          <h3>
            {preview.fileName} · {preview.count} 条观测
          </h3>
          <pre className="config-preview">
            {JSON.stringify(preview.rows.slice(0, 8), null, 2)}
          </pre>
          <button
            className="primary"
            disabled={action.busy}
            onClick={() => {
              if (
                window.confirm(
                  "确认导入这些观测？请先核对目标指标、单位、统计日期和原始来源。",
                )
              )
                void action.run(async () => {
                  await api(
                    "/api/v1/imports/commit",
                    json("POST", { token: preview.token, confirm: true }),
                  );
                  setPreview(undefined);
                }, "数据已写入，前往指标详情查看");
            }}
          >
            确认导入数据库
          </button>
        </section>
      )}
      <ActionFeedback action={action} />
    </>
  );
}
