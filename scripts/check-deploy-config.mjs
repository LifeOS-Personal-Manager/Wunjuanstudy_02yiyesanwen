import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
const failures = [];
const databaseId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1] || "";
const bucketName = config.match(/bucket_name\s*=\s*"([^"]+)"/)?.[1] || "";

if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(databaseId)) failures.push("wrangler.toml 中仍未配置真实 D1 database_id");
if (!bucketName || bucketName.includes("REPLACE_WITH")) failures.push("wrangler.toml 中仍未配置真实 R2 bucket_name");
if (/VITE_.*(?:KEY|TOKEN|SECRET)/i.test(config)) failures.push("禁止把服务端密钥配置为 VITE_* 变量");

if (failures.length) {
  console.error(`部署检查失败:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("部署配置检查通过。请继续确认 Pages secret 和 Cloudflare Access 策略。");
