import { randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
function scrypt(password: string, salt: string, legacy = false) {
  return new Promise<Buffer>((resolve, reject) => deriveKey(password, salt, 64, { N: legacy ? 16384 : 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return `scrypt-v2$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  if (/^\$2[aby]\$/.test(stored)) {
    // Imported bcrypt hashes are limited to 72 bytes. Longer credentials need an explicit reset.
    return Buffer.byteLength(password, "utf8") <= 72 && compare(password, stored.replace(/^\$2y\$/, "$2b$"));
  }
  const [version, salt, hex] = stored.split("$");
  if (!["scrypt-v1", "scrypt-v2"].includes(version) || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hex ?? "")) return false;
  const candidate = await scrypt(password, salt, version === "scrypt-v1");
  const expected = Buffer.from(hex, "hex");
  return timingSafeEqual(candidate, expected);
}
