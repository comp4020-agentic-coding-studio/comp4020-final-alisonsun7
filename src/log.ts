// One line per event on stdout, so `flyctl logs` shows who did what.
export function log(event: string, fields: Record<string, unknown> = {}): void {
  const time = new Date().toISOString().slice(11, 19);
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  console.log(`[${time}] INFO ${event}${kv ? " " + kv : ""}`);
}
