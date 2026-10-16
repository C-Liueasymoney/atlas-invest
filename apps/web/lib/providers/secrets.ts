import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../errors";
function keyBytes(key: string) {
  const b = Buffer.from(key, "base64");
  if (b.length !== 32)
    throw new AppError(
      "VALIDATION_ERROR",
      "CREDENTIAL_ENCRYPTION_KEY 必须为32字节的base64密钥",
      503,
    );
  return b;
}
export function encryptSecret(secret: string, key: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const data = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(payload: string, key: string) {
  const [iv, tag, data] = payload
    .split(".")
    .map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", keyBytes(key), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
