"use client";
import { useCallback, useEffect, useState } from "react";
export type Series = {
  id: string;
  nameZh: string;
  providerId: string;
  providerSymbol: string;
  kind: string;
  frequency: string;
  unit: string;
  currency: string;
  timezone: string;
  description: string;
  sourceUrl: string;
  staleSeconds: number;
  category: string;
};
export type Quote = {
  seriesId: string;
  value: string | null;
  previousValue: string | null;
  changeAbsolute?: string | null;
  changePercent?: string | null;
  changeBasis?: string;
  unit: string;
  currency: string;
  source: { id: string; label: string; url: string };
  asOfKind?: "date" | "timestamp";
  asOf: string | null;
  fetchedAt: string | null;
  status: string;
  isDemo: boolean;
  message?: string;
  sourceChanged?: boolean;
  qualityFlags?: string[];
};
export type Point = {
  time: string;
  value: string | null;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string | null;
};
export type Envelope = {
  series: Series;
  points: Point[];
  source: Quote["source"];
  asOf: string;
  fetchedAt: string;
  status: string;
  isDemo: boolean;
  unit: string;
  message?: string;
  sourceChanged?: boolean;
};
export type Provider = {
  id: string;
  displayName: string;
  category: string;
  docsUrl: string;
  termsUrl: string;
  licenseNote: string;
  envVar?: string;
  enabled: boolean;
  credential: {
    configured: boolean;
    last4?: string;
    source: "env" | "database" | "none";
  };
  config: {
    ttlSeconds: number;
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  capabilities: {
    assetClasses?: string[];
    operations?: string[];
    intervals?: string[];
    authMode?: string;
    latency?: string;
  };
  health?: { status: string; checkedAt: string; message?: string };
  coverageCount: number;
};
export type Route = {
  providerId: string;
  providerSymbol: string;
  operation: string;
  interval: string;
  priority: number;
  enabled: boolean;
  constraints: {
    unit: string;
    currency: string;
    market: string;
    priceDefinition: string;
    frequency: string;
  };
  mode: "auto" | "fixed";
};
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  const data = await response
    .json()
    .catch(() => ({ error: { message: "服务器返回了无法识别的响应" } }));
  if (!response.ok)
    throw new Error(data.error?.message || `请求失败 (${response.status})`);
  return data as T;
}
export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) return;
    let live = true;
    queueMicrotask(() => {
      if (live) {
        setLoading(true);
        setError("");
      }
    });
    api<T>(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error, loading, refresh, setData };
}
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(n)
    : "—";
}
export function dateTime(value: string | null | undefined) {
  if (!value) return "尚无记录";
  const d = new Date(value);
  return Number.isNaN(d.valueOf())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
}
export const statusLabel: Record<string, string> = {
  demo: "DEMO 演示",
  available: "连接可用",
  fresh: "已更新",
  latest: "已更新",
  ok: "已更新",
  delayed: "日级 / 延迟",
  stale: "数据陈旧",
  error: "读取失败",
  failed: "读取失败",
  unavailable: "暂不可用",
  not_configured: "待配置",
  unauthorized: "鉴权失败",
  rate_limited: "达到限额",
  unsupported: "不支持",
  disabled: "已停用",
  empty: "暂无数据",
};

export const unitLabel = (unit: string) =>
  ({
    "CNY/g": "元/克",
    "USD/troy_oz": "美元/盎司",
    "CNY/USD": "人民币/美元",
    percent: "%",
    index: "指数",
    tonnes: "吨",
    contracts: "张",
    USD: "美元",
  })[unit] || unit;
export const frequencyLabel = (frequency: string) =>
  ({ "1d": "日度", quote: "最新参考价", "1mo": "月度", "1w": "周度" })[
    frequency
  ] || frequency;
