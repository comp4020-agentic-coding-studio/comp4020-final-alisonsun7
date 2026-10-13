import type { GardenState } from "../src/types.js";

// One Session = one independent browser identity (its own cookie jar).
export class Session {
  private cookie = "";

  private constructor(private readonly baseUrl: string) {}

  static async join(baseUrl: string, nickname: string): Promise<Session> {
    const s = new Session(baseUrl);
    const res = await fetch(new URL("/join", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nickname }).toString(),
      redirect: "manual",
    });
    if (res.status !== 303) throw new Error(`join failed: ${res.status}`);
    s.cookie = res.headers.getSetCookie()[0].split(";")[0];
    return s;
  }

  get cookieHeader(): string {
    return this.cookie;
  }

  fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", this.cookie);
    return fetch(new URL(path, this.baseUrl), { ...init, headers, redirect: "manual" });
  }

  setNote(row: number, col: number, note: string | null): Promise<Response> {
    return this.fetch("/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ row, col, note }),
    });
  }

  setInstrument(instrument: string): Promise<Response> {
    return this.fetch("/instrument", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrument }),
    });
  }

  async events(): Promise<GardenEvents> {
    return new GardenEvents(await this.fetch("/events"));
  }
}

// Reads /events: one full GardenState per "data:" frame.
export class GardenEvents {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";
  private pending: Promise<GardenState | null> | null = null;

  constructor(res: Response) {
    if (!res.body) throw new Error(`no event stream (status ${res.status})`);
    this.reader = res.body.getReader();
  }

  private async read(): Promise<GardenState | null> {
    for (;;) {
      while (!this.buffer.includes("\n\n")) {
        const { value, done } = await this.reader.read();
        if (done) return null;
        this.buffer += this.decoder.decode(value, { stream: true });
      }
      const idx = this.buffer.indexOf("\n\n");
      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = frame.split("\n").find((l) => l.startsWith("data:"));
      if (data) return JSON.parse(data.slice(5).trim()) as GardenState;
    }
  }

  // Never abandons a read mid-flight: a timed-out read is resumed by the
  // next call instead of silently swallowing a frame.
  next(): Promise<GardenState | null> {
    this.pending ??= this.read().finally(() => (this.pending = null));
    return this.pending;
  }

  async waitFor(match: (s: GardenState) => boolean, timeoutMs = 1000): Promise<GardenState> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`no matching state within ${timeoutMs}ms`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const frame = await Promise.race([
        this.next(),
        new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), remaining))),
      ]);
      clearTimeout(timer);
      if (frame === "timeout") throw new Error(`no matching state within ${timeoutMs}ms`);
      if (frame === null) throw new Error("event stream ended");
      if (match(frame)) return frame;
    }
  }

  cancel(): void {
    void this.reader.cancel().catch(() => {});
  }
}
