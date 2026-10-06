import type { IncomingMessage } from "node:http";

const MAX_BODY_BYTES = 16 * 1024;

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const [key, value = ""] = pair.split("=");
    out[decodeURIComponent(key.replace(/\+/g, " "))] = decodeURIComponent(value.replace(/\+/g, " "));
  }
  return out;
}
