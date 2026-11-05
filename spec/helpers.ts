// What the spec files share: joining as a person, reading a place's live
// stream, all over HTTP against a running app.
import type { ServerMessage, Snapshot } from "../src/shared/protocol.ts";

export interface Person {
  name: string;
  cookie: string;
}

// POST /join the way the form does, and keep the session cookie it sets.
export async function join(baseUrl: string, name: string, avatar: "cat" | "dog" = "cat"): Promise<Person> {
  const res = await fetch(new URL("/join", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nickname: name, avatar, next: "/explore" }),
    redirect: "manual",
  });
  if (res.status !== 303) throw new Error(`join returned ${res.status}`);
  const set = res.headers.get("set-cookie") ?? "";
  const cookie = set.split(";")[0];
  if (!cookie.startsWith("soac_session=")) throw new Error(`join set no session cookie: ${set}`);
  return { name, cookie };
}

// One open /api/stream connection, collecting every message it receives.
export class Stream {
  messages: { at: number; msg: ServerMessage }[] = [];
  private controller = new AbortController();
  private waiters: (() => void)[] = [];
  closed: Promise<void>;

  private constructor(closed: Promise<void>) {
    this.closed = closed;
  }

  static async open(baseUrl: string, sceneId: string, mode: string, who: Person | null): Promise<Stream> {
    const stream = new Stream(Promise.resolve());
    const res = await fetch(new URL(`/api/stream?scene=${sceneId}&mode=${mode}`, baseUrl), {
      headers: who ? { cookie: who.cookie } : {},
      signal: stream.controller.signal,
    });
    if (res.status !== 200 || !res.body) throw new Error(`stream returned ${res.status}`);
    stream.closed = stream.read(res.body);
    await stream.next((m) => m.type === "snapshot");
    return stream;
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame
            .split("\n")
            .filter((l) => l.startsWith("data: "))
            .map((l) => l.slice(6))
            .join("\n");
          if (!data) continue;
          this.messages.push({ at: performance.now(), msg: JSON.parse(data) as ServerMessage });
          for (const w of this.waiters.splice(0)) w();
        }
      }
    } catch {
      // aborted by close()
    }
  }

  // The first message (from `from` on) matching `test`, waiting up to `ms`.
  async next<T extends ServerMessage>(test: (m: ServerMessage) => m is T, ms?: number, from?: number): Promise<T>;
  async next(test: (m: ServerMessage) => boolean, ms?: number, from?: number): Promise<ServerMessage>;
  async next(test: (m: ServerMessage) => boolean, ms = 3000, from = 0): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = this.messages.slice(from).find((m) => test(m.msg));
      if (found) return found.msg;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`no matching message within ${ms} ms; got ${this.messages.map((m) => m.msg.type).join(", ")}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  snapshot(): Snapshot {
    const snaps = this.messages.filter((m) => m.msg.type === "snapshot");
    return snaps[snaps.length - 1].msg as Snapshot;
  }

  close(): void {
    this.controller.abort();
  }
}
