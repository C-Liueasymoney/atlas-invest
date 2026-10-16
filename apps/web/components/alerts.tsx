"use client";
import { useState } from "react";
import { Bell, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, dateTime, json, Series, useRemote } from "./api";
import {
  ActionFeedback,
  Badge,
  Empty,
  ErrorNotice,
  Modal,
  PageHeading,
  useAction,
} from "./ui";
type Alert = {
  id: string;
  seriesId: string;
  conditionType: string;
  params: { threshold: number; window?: number };
  cooldownSeconds: number;
  enabled: boolean;
};
type AlertEvent = {
  id: string;
  alertId: string;
  seriesId?: string;
  triggeredAt?: string;
  createdAt?: string;
  message?: string;
  value?: string;
  observedValue?: string | null;
  seriesAsOf?: string | null;
  status?: string;
};
const conditions: Record<string, string> = {
  crosses_above: "向上穿越阈值",
  crosses_below: "向下穿越阈值",
  pct_change: "区间百分比变化",
  data_stale: "数据陈旧",
  new_observation: "出现新观测",
};
export function AlertsPage() {
  const remote = useRemote<{ items: Alert[] }>("/api/v1/alerts");
  const history = useRemote<{ items: AlertEvent[] }>("/api/v1/alert-events");
  const catalog = useRemote<{ items: Series[] }>("/api/v1/catalog");
  const [modal, setModal] = useState(false);
  const [seriesId, setSeriesId] = useState("SGE_AU9999_D1");
  const [condition, setCondition] = useState("crosses_above");
  const [threshold, setThreshold] = useState("1000");
  const [windowSize, setWindowSize] = useState("1");
  const [cooldown, setCooldown] = useState("3600");
  const [tab, setTab] = useState("rules");
  const action = useAction();
  const name = (id: string) =>
    catalog.data?.items.find((s) => s.id === id)?.nameZh || id;
  return (
    <>
      <PageHeading
        eyebrow="STAY INFORMED, STAY PATIENT"
        title="预警中心"
        description="记录值得关注的变化。站内预警按采集数据评估，非盘中推送服务。"
        actions={
          <>
            <button
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await api("/api/v1/alerts/evaluate", json("POST"));
                  remote.refresh();
                  history.refresh();
                }, "规则评估完成，请查看触发历史")
              }
            >
              <RefreshCw size={15} />
              立即评估
            </button>
            <button className="primary" onClick={() => setModal(true)}>
              <Plus size={16} />
              新建预警
            </button>
          </>
        }
      />
      <ActionFeedback action={action} />
      <div className="section-toolbar">
        <div className="tabs">
          <button
            className={tab === "rules" ? "active" : ""}
            onClick={() => setTab("rules")}
          >
            预警规则 <span>{remote.data?.items.length || 0}</span>
          </button>
          <button
            className={tab === "events" ? "active" : ""}
            onClick={() => setTab("events")}
          >
            触发历史 <span>{history.data?.items.length || 0}</span>
          </button>
        </div>
      </div>
      <ErrorNotice
        message={remote.error || history.error}
        retry={() => {
          remote.refresh();
          history.refresh();
        }}
      />
      {tab === "rules" ? (
        <div className="panel">
          {!remote.data?.items.length ? (
            <Empty>
              <Bell size={26} />
              暂无规则。设置价格穿越、数据更新或陈旧预警。
            </Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>观察指标</th>
                    <th>触发条件</th>
                    <th>冷却时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {remote.data.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{name(a.seriesId)}</strong>
                        <small>{a.seriesId}</small>
                      </td>
                      <td>
                        {conditions[a.conditionType] || a.conditionType}
                        <small>
                          {a.conditionType === "new_observation"
                            ? "每个新的有效观测"
                            : `${a.params.threshold}${a.conditionType === "pct_change" ? "%" : a.conditionType === "data_stale" ? " 秒" : ""}`}
                          {a.conditionType === "pct_change" &&
                            ` · 窗口 ${a.params.window || 1} 个观测`}
                        </small>
                      </td>
                      <td>{a.cooldownSeconds} 秒</td>
                      <td>
                        <button
                          className={`switch ${a.enabled ? "on" : ""}`}
                          role="switch"
                          aria-checked={a.enabled}
                          aria-label={`启停 ${name(a.seriesId)} 预警`}
                          disabled={action.busy}
                          onClick={() =>
                            action.run(async () => {
                              await api(
                                `/api/v1/alerts/${a.id}`,
                                json("PATCH", { enabled: !a.enabled }),
                              );
                              remote.refresh();
                            }, "预警状态已更新")
                          }
                        >
                          <span />
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-button danger"
                          aria-label={`删除 ${name(a.seriesId)} 预警`}
                          disabled={action.busy}
                          onClick={() => {
                            if (window.confirm("确认删除这条预警规则？"))
                              void action.run(async () => {
                                await api(
                                  `/api/v1/alerts/${a.id}`,
                                  json("DELETE"),
                                );
                                remote.refresh();
                              }, "规则已删除");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <section className="panel">
          {!history.data?.items.length ? (
            <Empty>暂无触发记录。规则会在数据满足条件时创建站内事件。</Empty>
          ) : (
            <div className="event-list">
              {history.data.items.map((event) => (
                <div key={event.id}>
                  <Bell size={17} />
                  <div>
                    <strong>
                      {event.message ||
                        `${event.seriesId ? name(event.seriesId) : name(remote.data?.items.find((a) => a.id === event.alertId)?.seriesId || "预警")}触发`}
                    </strong>
                    <p>
                      {(event.value || event.observedValue) &&
                        `触发值 ${event.value || event.observedValue}`}{" "}
                      · {dateTime(event.triggeredAt || event.createdAt)}
                      {event.seriesAsOf &&
                        ` · 数据截至 ${dateTime(event.seriesAsOf)}`}
                    </p>
                  </div>
                  <Badge status="已触发" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {modal && (
        <Modal title="新建预警规则" onClose={() => setModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api(
                  "/api/v1/alerts",
                  json("POST", {
                    seriesId,
                    conditionType: condition,
                    params: {
                      threshold: Number(threshold),
                      ...(condition === "pct_change"
                        ? { window: Number(windowSize) }
                        : {}),
                    },
                    cooldownSeconds: Number(cooldown),
                  }),
                );
                setModal(false);
                remote.refresh();
              }, "预警规则已创建");
            }}
          >
            <label>
              观察指标
              <select
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
              >
                {catalog.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameZh} · {s.unit}
                  </option>
                ))}
              </select>
            </label>
            <label>
              触发条件
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                {Object.entries(conditions).map(([key, value]) => (
                  <option value={key} key={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            {condition !== "new_observation" && (
              <label>
                {condition === "data_stale"
                  ? "陈旧时长（秒）"
                  : condition === "pct_change"
                    ? "变化阈值（%）"
                    : `阈值（${catalog.data?.items.find((s) => s.id === seriesId)?.unit || "原始单位"}）`}
                <input
                  required
                  type="number"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </label>
            )}
            {condition === "pct_change" && (
              <label>
                比较窗口（观测数）
                <input
                  required
                  min="1"
                  type="number"
                  value={windowSize}
                  onChange={(e) => setWindowSize(e.target.value)}
                />
              </label>
            )}
            <label>
              冷却时间（秒）
              <input
                required
                min="0"
                type="number"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
              />
            </label>
            <p className="muted small">
              穿越规则只在越过阈值时触发；冷却期内不会重复记录。Demo
              规则只使用演示数据。
            </p>
            <button className="primary" disabled={action.busy}>
              保存预警规则
            </button>
            <ActionFeedback action={action} />
          </form>
        </Modal>
      )}
    </>
  );
}
