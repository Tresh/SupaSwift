import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encrypts a value at rest using AES-256-GCM.
 * Key comes from TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 * Payload format: "v1.<iv_hex>.<auth_tag_hex>.<ciphertext_hex>"
 */

const ALGO = "aes-256-gcm";
// Version marker WITHOUT a trailing dot - it's joined with "." separators.
const KEY_PREFIX = "v1";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32"
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    KEY_PREFIX,
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  let parts = payload.split(".");
  // Legacy rows were written as "v1..<iv>.<tag>.<cipher>" because KEY_PREFIX
  // used to include its own trailing dot. Normalize that shape so existing
  // connections keep working.
  if (parts.length === 5 && parts[0] === KEY_PREFIX && parts[1] === "") {
    parts = [parts[0], ...parts.slice(2)];
  }
  if (parts.length !== 4 || parts[0] !== KEY_PREFIX) {
    throw new Error("Invalid encrypted payload");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
