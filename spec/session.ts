// A minimal cookie jar for spec/*.test.ts: each independent room/participant
// identity in the manual walkthrough (docs/acceptance.md) is one Session
// here, so two Sessions are two separate browser identities, never two tabs
// sharing storage.
export class Session {
  private cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private capture(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(new URL(path, this.baseUrl), { ...init, headers, redirect: "manual" });
    this.capture(res);
    return res;
  }

  async createRoom(title: string, nickname: string): Promise<{ code: string; res: Response }> {
    const res = await this.fetch("/rooms", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, nickname }).toString(),
    });
    const location = res.headers.get("location") ?? "";
    const code = location.replace("/rooms/", "");
    return { code, res };
  }

  submitIdea(
    code: string,
    idea: { category: string; title: string; requestKey: string },
  ): Promise<Response> {
    return this.fetch(`/rooms/${code}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(idea),
    });
  }

  roomPage(code: string): Promise<Response> {
    return this.fetch(`/rooms/${code}`);
  }
}
