"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { api, json } from "@/components/api";
import { ActionFeedback, useAction } from "@/components/ui";
export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const action = useAction();
  return (
    <main className="login-page">
      <section className="panel login-card">
        <span className="eyebrow">ATLAS / INVEST</span>
        <LockKeyhole size={26} />
        <h1>回到你的研究空间</h1>
        <p className="muted">私有数据与配置仅对所有者开放。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const result = await api<{
                authenticated: boolean;
                returnTo?: string;
              }>(
                "/api/auth/login",
                json("POST", {
                  password,
                  returnTo:
                    new URLSearchParams(window.location.search).get("next") ||
                    undefined,
                }),
              );
              setPassword("");
              if (result.returnTo) {
                window.location.replace(result.returnTo);
                return;
              }
              router.push("/dashboard");
              router.refresh();
            }, "登录成功");
          }}
        >
          <label>
            工作空间密码
            <input
              autoFocus
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入所有者密码"
            />
          </label>
          <button className="primary" disabled={action.busy}>
            {action.busy ? "验证中…" : "进入工作空间"}
            <ArrowRight size={15} />
          </button>
          <ActionFeedback action={action} />
        </form>
        <p className="small muted">数据仅供研究 · 独立思考 · 审慎决策</p>
      </section>
    </main>
  );
}
