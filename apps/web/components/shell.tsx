"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Menu,
  Moon,
  Search,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { api, json, Series, useRemote } from "./api";
import { ErrorNotice, Modal } from "./ui";
const links = [
  { href: "/dashboard", title: "市场总览" },
  { href: "/workspace", title: "图表" },
  { href: "/indicators", title: "指标" },
  { href: "/watchlists", title: "自选" },
  { href: "/alerts", title: "预警" },
  { href: "/research", title: "研究" },
  { href: "/settings/data-sources", title: "数据源配置" },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [light, setLight] = useState(true);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const session = useRemote<{
    mode: "demo" | "live" | "preview";
    authenticated: boolean;
    timezone: string;
  }>("/api/v1/session");
  const catalog = useRemote<{ items: Series[] }>(
    search ? `/api/v1/catalog?q=${encodeURIComponent(query)}` : null,
  );
  useEffect(() => {
    const theme = localStorage.getItem("atlas-theme-v2") || "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.colors =
      localStorage.getItem("atlas-colors") || "cn";
    queueMicrotask(() => setLight(theme === "light"));
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if (e.key === "Escape") {
        setSearch(false);
        setMenu(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function toggleTheme() {
    const next = !light;
    setLight(next);
    document.documentElement.dataset.theme = next ? "light" : "dark";
    localStorage.setItem("atlas-theme-v2", next ? "light" : "dark");
  }
  return (
    <div className="app-shell market-shell">
      <header className="market-header">
        <Link
          href="/dashboard"
          className="atlas-wordmark"
          aria-label="Atlas Invest 首页"
        >
          <span className="atlas-mark">a</span>atlas
          <span className="brand-invest">invest</span>
        </Link>
        <nav
          className={`horizontal-nav ${menu ? "is-open" : ""}`}
          aria-label="主导航"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path.startsWith(l.href) ? "active" : ""}
              onClick={() => setMenu(false)}
            >
              {l.title}
            </Link>
          ))}
        </nav>
        <div className="market-header-tools">
          <button
            className="market-search"
            aria-label="搜索指标"
            onClick={() => setSearch(true)}
          >
            <Search size={18} />
            <span>搜索</span>
            <kbd>⌘ K</kbd>
          </button>
          <Link
            href="/settings"
            className="icon-button preferences-link"
            aria-label="偏好设置"
          >
            <Settings2 size={18} />
          </Link>
          <button
            className="icon-button"
            onClick={toggleTheme}
            aria-label={light ? "切换深色主题" : "切换浅色主题"}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className="icon-button nav-menu-button"
            aria-label={menu ? "关闭导航" : "打开导航"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
          {!session.data?.authenticated && session.data?.mode === "live" && (
            <Link className="button primary" href="/login">
              登录
            </Link>
          )}
        </div>
      </header>
      <div className="main-area">
        <main className="workspace-main">
          <ErrorNotice message={session.error} retry={session.refresh} />
          {session.data?.mode === "preview" && (
            <div className="preview-banner">
              <span className="market-state-dot" />
              真实数据预览 · 最近成功采集<span>日级数据，非实时行情</span>
            </div>
          )}
          {session.data?.mode === "demo" && (
            <div className="demo-banner">
              <span className="demo-tag">演示模式</span>
              <span>当前为独立演示数据，不代表真实市场行情。</span>
              <Link href="/settings/data-sources">
                接入真实数据 <ArrowUpRight size={13} />
              </Link>
            </div>
          )}
          {children}
        </main>
        <footer className="footer">
          <span>Atlas Invest · 个人投资研究</span>
          <span>Asia/Shanghai · 日级参考数据，仅供研究</span>
        </footer>
      </div>
      {search && (
        <Modal title="搜索指标" onClose={() => setSearch(false)}>
          <div className="search-field">
            <Search size={17} />
            <input
              autoFocus
              aria-label="全局搜索指标"
              placeholder="搜索名称、代码或市场…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ErrorNotice message={catalog.error} />
          <div className="search-results">
            {catalog.data?.items.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSearch(false);
                  router.push(`/indicators/${s.id}`);
                }}
              >
                <div>
                  <strong>{s.nameZh}</strong>
                  <small>{s.id}</small>
                </div>
                <span>
                  {s.unit}
                  <ArrowUpRight size={16} />
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
export function Preferences() {
  const router = useRouter();
  const [color, setColor] = useState("cn");
  useEffect(() => {
    queueMicrotask(() =>
      setColor(localStorage.getItem("atlas-colors") || "cn"),
    );
  }, []);
  return (
    <section className="panel settings-panel">
      <h2>显示与隐私</h2>
      <label>
        涨跌颜色
        <select
          value={color}
          onChange={(e) => {
            setColor(e.target.value);
            localStorage.setItem("atlas-colors", e.target.value);
            document.documentElement.dataset.colors = e.target.value;
          }}
        >
          <option value="cn">中国习惯：红涨绿跌</option>
          <option value="global">国际习惯：绿涨红跌</option>
        </select>
      </label>
      <p className="muted">
        显示时区：Asia/Shanghai。切换明暗主题使用右上角按钮。API
        密钥不会保存在浏览器本地。
      </p>
      <button
        onClick={async () => {
          await api("/api/auth/logout", json("POST"));
          router.push("/login");
          router.refresh();
        }}
      >
        退出登录
      </button>
    </section>
  );
}
