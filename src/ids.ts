import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

// Excludes 0/O and 1/I, which people misread when copying a code aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode(): string {
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export const normaliseRoomCode = (raw: string): string => raw.trim().toUpperCase();

export const newCredential = (): string => randomBytes(24).toString("base64url");

export const hashCredential = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");
