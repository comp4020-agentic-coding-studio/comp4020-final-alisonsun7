// M1 minimum live slice: an in-process SSE hub. One Node process, one
// SQLite connection — subscribers are plain callbacks kept in memory, not a
// queue or pub/sub service. A multi-machine deployment would need a shared
// bus instead; CLAUDE.md keeps this app on a single machine, so this is
// deliberately not built for that case (see docs/decisions/daydraw-live-behaviour.md).

type Listener = () => void;

const subscribers = new Map<string, Set<Listener>>();
const pendingFlush = new Map<string, ReturnType<typeof setTimeout>>();

// Coalescing window for bursts: several commits to the same room within this
// window collapse into one flush, which re-reads current state at flush
// time — so it always reflects every commit so far, not just the first one.
const COALESCE_MS = 15;

export function subscribe(roomId: string, listener: Listener): () => void {
  let set = subscribers.get(roomId);
  if (!set) {
    set = new Set();
    subscribers.set(roomId, set);
  }
  set.add(listener);

  return () => {
    const current = subscribers.get(roomId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) subscribers.delete(roomId);
  };
}

function flush(roomId: string): void {
  pendingFlush.delete(roomId);
  const set = subscribers.get(roomId);
  if (!set) return;
  for (const listener of set) listener();
}

// Call after a committed, state-changing mutation (join, proposal, start —
// never after a read-only replay/conflict outcome). Safe to call with no
// subscribers; safe to call repeatedly within the coalescing window.
export function notifyRoom(roomId: string): void {
  if (pendingFlush.has(roomId)) return;
  pendingFlush.set(roomId, setTimeout(() => flush(roomId), COALESCE_MS));
}

// Test-only introspection (LIVE05 lifecycle): confirms unsubscribe actually
// removes listeners instead of leaking them across reconnects/page closes.
export function _subscriberCountForTests(roomId: string): number {
  return subscribers.get(roomId)?.size ?? 0;
}
