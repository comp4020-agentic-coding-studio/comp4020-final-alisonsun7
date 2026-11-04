import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { db, nowIso } from "./db.js";
import type { Avatar } from "./shared/protocol.js";

export interface User {
  id: string;
  nickname: string;
  avatar: Avatar;
}

const hash = (token: string): string => createHash("sha256").update(token).digest("hex");

// The browser holds only a random session token (HttpOnly cookie); the DB
// stores its hash. A client never names its own user id, so it can't act as
// anyone else.
export function createUser(nickname: string, avatar: Avatar): { user: User; token: string } {
  const id = `usr_${randomBytes(6).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO users (id, nickname, avatar, session_token_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    nickname,
    avatar,
    hash(token),
    nowIso(),
  );
  return { user: { id, nickname, avatar }, token };
}

export function userFromRequest(req: IncomingMessage): User | null {
  const token = readCookie(req, "soac_session");
  if (!token) return null;
  const row = db.prepare("SELECT id, nickname, avatar FROM users WHERE session_token_hash = ?").get(hash(token)) as
    | { id: string; nickname: string; avatar: Avatar }
    | undefined;
  return row ? { id: row.id, nickname: row.nickname, avatar: row.avatar } : null;
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `soac_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure}`;
}

export function clearCookie(): string {
  return "soac_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
