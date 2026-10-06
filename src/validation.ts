export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const trimmed = (raw: unknown): string => (typeof raw === "string" ? raw.trim() : "");

function bounded(raw: unknown, min: number, max: number, label: string): Validated<string> {
  const value = trimmed(raw);
  if (value.length < min || value.length > max) {
    return { ok: false, error: `${label} must be ${min}-${max} characters.` };
  }
  return { ok: true, value };
}

export const validateRoomTitle = (raw: unknown): Validated<string> => bounded(raw, 1, 60, "Room title");

export const validateRoomCode = (raw: unknown): Validated<string> => bounded(raw, 1, 20, "Room code");

export const validateNickname = (raw: unknown): Validated<string> => bounded(raw, 1, 30, "Nickname");

export const validateIdeaTitle = (raw: unknown): Validated<string> => bounded(raw, 1, 120, "Idea title");

export const CATEGORIES = ["WHERE", "EAT", "DO"] as const;
export type Category = (typeof CATEGORIES)[number];

export function validateCategory(raw: unknown): Validated<Category> {
  if (typeof raw === "string" && (CATEGORIES as readonly string[]).includes(raw)) {
    return { ok: true, value: raw as Category };
  }
  return { ok: false, error: "Category must be one of WHERE, EAT, DO." };
}

export function validateRequestKey(raw: unknown): Validated<string> {
  if (typeof raw === "string" && raw.length >= 1 && raw.length <= 200) {
    return { ok: true, value: raw };
  }
  return { ok: false, error: "A request key is required." };
}
