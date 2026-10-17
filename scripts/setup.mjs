import { copyFile, access } from "node:fs/promises";
try {
  await access(".env");
} catch {
  await copyFile(".env.example", ".env");
}
console.log(
  "环境文件已就绪。npm run dev 启动真实数据预览；先安装Python采集器，再用 npm run data:refresh 获取实际行情。正式模式需数据库。",
);
