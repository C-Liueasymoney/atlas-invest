import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Atlas Invest · 个人投资研究",
  description: "黄金与宏观数据的个人研究工作台",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
