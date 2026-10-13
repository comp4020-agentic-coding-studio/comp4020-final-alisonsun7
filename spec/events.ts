import type { BoardState } from "../src/types.js";

// A minimal SSE reader for spec/*.test.ts: /events sends one JSON board
// snapshot per "data: ...\n\n" frame (src/state.ts's broadcast shape), so
// this just needs to split on blank lines and JSON.parse the data line.
export class BoardEvents {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";

  private constructor(res: Response) {
    if (!res.body) throw new Error("event stream response has no body");
    this.reader = res.body.getReader();
  }

  static async connect(baseUrl: string): Promise<BoardEvents> {
    const res = await fetch(new URL("/events", baseUrl));
    return new BoardEvents(res);
  }

  async next(): Promise<BoardState | null> {
    for (;;) {
      while (!this.buffer.includes("\n\n")) {
        const { value, done } = await this.reader.read();
        if (done) return null;
        this.buffer += this.decoder.decode(value, { stream: true });
      }
      const idx = this.buffer.indexOf("\n\n");
      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue; // e.g. the leading "retry: 2000" line
      return JSON.parse(dataLine.slice("data:".length).trim()) as BoardState;
    }
  }

  // Reads frames until one satisfies `match` or `timeoutMs` elapses.
  async waitFor(match: (state: BoardState) => boolean, timeoutMs = 1000): Promise<BoardState> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("waitFor: timed out before a matching board state arrived");
      const frame = await Promise.race([
        this.next(),
        new Promise<"__timeout__">((resolve) => setTimeout(() => resolve("__timeout__"), remaining)),
      ]);
      if (frame === "__timeout__") throw new Error("waitFor: timed out before a matching board state arrived");
      if (frame === null) throw new Error("waitFor: stream ended before a matching board state arrived");
      if (match(frame)) return frame;
    }
  }

  cancel(): void {
    void this.reader.cancel();
  }
}
