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

  async joinRoom(code: string, nickname: string): Promise<Response> {
    return this.fetch("/join", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, nickname }).toString(),
    });
  }

  startRoom(code: string): Promise<Response> {
    return this.fetch(`/rooms/${code}/start`, { method: "POST" });
  }

  homePage(): Promise<Response> {
    return this.fetch("/");
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

  async events(code: string): Promise<EventReader> {
    const res = await this.fetch(`/rooms/${code}/events`);
    return new EventReader(res);
  }
}

// A minimal SSE client for spec/*.test.ts: reads one "event: x\ndata: y\n\n"
// frame at a time, always fully awaiting the previous read before starting
// the next (never abandoning one mid-flight, which would leave it dangling
// in the stream's internal read-request queue and silently swallow a later
// frame).
export class EventReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(res: Response) {
    if (!res.body) throw new Error("event stream response has no body");
    this.reader = res.body.getReader();
  }

  // Returns the next frame's { event, data }, skipping bare comment/retry
  // lines (which have no blank-line-terminated "data:" field); null at EOF.
  async next(): Promise<{ event: string; data: unknown } | null> {
    for (;;) {
      while (!this.buffer.includes("\n\n")) {
        const { value, done } = await this.reader.read();
        if (done) return null;
        this.buffer += this.decoder.decode(value, { stream: true });
      }
      const idx = this.buffer.indexOf("\n\n");
      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);

      const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue; // e.g. the leading "retry: 2000" line
      const event = eventLine ? eventLine.slice("event:".length).trim() : "message";
      return { event, data: JSON.parse(dataLine.slice("data:".length).trim()) };
    }
  }

  // Reads frames until one satisfies `match` or `timeoutMs` elapses.
  async waitFor(
    match: (data: unknown) => boolean,
    timeoutMs = 2000,
  ): Promise<unknown> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("waitFor: timed out before a matching event arrived");
      const frame = await Promise.race([
        this.next(),
        new Promise<"__timeout__">((resolve) => setTimeout(() => resolve("__timeout__"), remaining)),
      ]);
      if (frame === "__timeout__") throw new Error("waitFor: timed out before a matching event arrived");
      if (frame === null) throw new Error("waitFor: stream ended before a matching event arrived");
      if (match(frame.data)) return frame.data;
    }
  }

  cancel(): void {
    void this.reader.cancel();
  }
}
