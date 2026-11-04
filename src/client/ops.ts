// Sending changes to the server. Every change carries an operationId the
// server records once, so a retry after a dropped connection never adds a
// sound twice.
import type { Op, OpResult } from "../shared/protocol.js";

export function newOperationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `op_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

type Distributive<T> = T extends unknown ? Omit<T, "operationId"> : never;
export type OpBody = Distributive<Op>;

export async function sendOp(sessionId: string, body: OpBody, operationId = newOperationId()): Promise<OpResult> {
  const op = { ...body, operationId } as Op;
  // Retry network failures (not rejections) with the same id: the server
  // treats a repeat as already done.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(op),
      });
      const result = (await res.json()) as OpResult;
      return result;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { ok: false, code: "bad_request", message: "Connection lost. New changes aren't saved yet." };
}
