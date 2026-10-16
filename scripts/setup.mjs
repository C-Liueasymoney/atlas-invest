import { copyFile, access } from "node:fs/promises";
try {
  await access(".env");
} catch {
  await copyFile(".env.example", ".env");
}
console.log(
  "环境文件已就绪。npm run dev 启动本地 Demo；真实模式先启动数据库并迁移。",
);
