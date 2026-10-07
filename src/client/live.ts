// M1 minimum live slice. One EventSource per room page: on every message it
// gets the full authoritative snapshot (membership, proposals, phase), never
// a delta, so "apply the latest one" is the entire client-side protocol —
// see docs/decisions/daydraw-live-behaviour.md section A, option 3.

export interface LiveParticipant {
  id: string;
  nickname: string;
  role: string | null;
}

export interface LiveProposal {
  id: string;
  category: string;
  title: string;
  authorNickname: string;
  createdAt: string;
}

export interface RoomSnapshot {
  revision: number;
  phase: string;
  participants: LiveParticipant[];
  proposals: LiveProposal[];
}

// A disconnected/slow client can receive an older snapshot after a newer one
// (reconnect racing a queued notification); this is the single ordering
// rule that protects against ever rendering a rollback (LIVE04).
export function isNewer(knownRevision: number, incomingRevision: number): boolean {
  return incomingRevision > knownRevision;
}

// Mirrors src/rooms.ts's constants for the one client-side decision that
// depends on them (showing/hiding the start button). Not imported directly:
// src/rooms.ts pulls in node:sqlite, which does not run in a browser.
const MIN_TO_START = 2;
const CATEGORIES = ["WHERE", "EAT", "DO"];

function renderParticipantCount(el: HTMLElement, count: number): void {
  el.textContent = `${count} of 12 joined (registered members — not a live presence count)`;
}

function renderStageLine(el: HTMLElement, phase: string): void {
  const current = phase === "planning" ? "Planning" : "Ideas";
  el.textContent = `Stage: Draw (done) → ${current} (current) → Vote (later) → Reveal (later)`;
}

function renderParticipants(el: HTMLElement, participants: LiveParticipant[], viewerId: string | undefined): void {
  el.replaceChildren(
    ...participants.map((p) => {
      const li = document.createElement("li");
      const you = viewerId && p.id === viewerId ? " (you)" : "";
      li.textContent = `${p.nickname}${you} — ${p.role ?? "unassigned"}`;
      return li;
    }),
  );
}

function renderStartBlock(
  el: HTMLElement,
  opts: { phase: string; roomCode: string; participantCount: number; hasViewer: boolean },
): void {
  if (!opts.hasViewer) {
    el.replaceChildren();
    return;
  }
  if (opts.phase === "planning") {
    const p = document.createElement("p");
    p.textContent = "This room has started planning together.";
    el.replaceChildren(p);
    return;
  }
  if (opts.participantCount < MIN_TO_START) {
    const p = document.createElement("p");
    p.textContent = "Starting becomes available once a second person joins. Saving ideas doesn't need to wait for that.";
    el.replaceChildren(p);
    return;
  }
  const form = document.createElement("form");
  form.method = "post";
  form.action = `/rooms/${opts.roomCode}/start`;
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Start planning together";
  form.appendChild(button);
  el.replaceChildren(form);
}

function renderBoard(boardEl: HTMLElement, proposals: LiveProposal[]): void {
  for (const category of CATEGORIES) {
    const list = boardEl.querySelector<HTMLElement>(`[data-category="${category}"]`);
    if (!list) continue;
    const items = proposals.filter((p) => p.category === category);
    if (items.length === 0) {
      const empty = document.createElement("li");
      const em = document.createElement("em");
      em.textContent = "No ideas yet.";
      empty.appendChild(em);
      list.replaceChildren(empty);
      continue;
    }
    list.replaceChildren(
      ...items.map((p) => {
        const li = document.createElement("li");
        li.append(`${p.title} `);
        const author = document.createElement("span");
        author.className = "author";
        author.textContent = `— ${p.authorNickname}`;
        li.appendChild(author);
        return li;
      }),
    );
  }
}

function init(): void {
  const board = document.querySelector<HTMLElement>("#board");
  const liveStatus = document.querySelector<HTMLElement>("#live-status");
  if (!board || !liveStatus) return;

  const roomCode = board.dataset.roomCode;
  const viewerId = board.dataset.viewerId;
  if (!roomCode) return;

  // -1 is lower than any real revision (they start at 0), so the very
  // first snapshot the stream sends — which the server always sends
  // immediately on connect, before any notification — is always applied.
  // There is no separate bootstrap payload: the already-rendered page is
  // shown as-is until that first message arrives, typically within
  // milliseconds, confirming rather than replacing what's already there.
  let knownRevision = -1;

  const participantsEl = document.querySelector<HTMLElement>("#participants-list");
  const participantCountEl = document.querySelector<HTMLElement>("#participant-count");
  const stageLineEl = document.querySelector<HTMLElement>("#stage-line");
  const startBlockEl = document.querySelector<HTMLElement>("#start-block");

  const apply = (snapshot: RoomSnapshot): void => {
    if (!isNewer(knownRevision, snapshot.revision)) return;
    knownRevision = snapshot.revision;

    if (participantsEl) renderParticipants(participantsEl, snapshot.participants, viewerId);
    if (participantCountEl) renderParticipantCount(participantCountEl, snapshot.participants.length);
    if (stageLineEl) renderStageLine(stageLineEl, snapshot.phase);
    if (startBlockEl) {
      renderStartBlock(startBlockEl, {
        phase: snapshot.phase,
        roomCode,
        participantCount: snapshot.participants.length,
        hasViewer: viewerId !== undefined,
      });
    }
    renderBoard(board, snapshot.proposals);
  };

  const source = new EventSource(`/rooms/${roomCode}/events`);

  // "Live" only while the transport actually reports open (ADR section A):
  // never claimed ahead of a real connection, and dropped the instant the
  // browser's own EventSource says the connection is gone.
  source.addEventListener("open", () => {
    liveStatus.textContent = "Live updates: live";
  });
  source.addEventListener("error", () => {
    liveStatus.textContent = "Live updates: reconnecting…";
  });
  source.addEventListener("snapshot", (event) => {
    apply(JSON.parse((event as MessageEvent).data) as RoomSnapshot);
  });
}

// Guarded so this module can be imported directly in spec/live-client.test.ts
// (to unit-test isNewer) without a DOM — src/client/room.ts's own top-level
// querySelector calls are already no-ops outside a room page for the same
// reason, just without needing the guard since nothing imports it directly.
if (typeof document !== "undefined") init();
