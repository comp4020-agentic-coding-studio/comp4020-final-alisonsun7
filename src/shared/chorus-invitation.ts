// A link identifies an existing public work. It grants no identity or write access.
export function invitationWork(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : null;
}
export function invitationHref(value: unknown, base = "/planet"): string {
  const work = invitationWork(value);
  return work ? `${base}${base.includes("?") ? "&" : "?"}work=${encodeURIComponent(work)}` : base;
}
