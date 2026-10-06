export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

// httpOnly always: these cookies only identify a participant to the server,
// no client script needs to read them.
export function serializeCookie(
  name: string,
  value: string,
  opts: { secure: boolean; maxAgeSeconds?: number } = { secure: false },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (opts.secure) parts.push("Secure");
  if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join("; ");
}
