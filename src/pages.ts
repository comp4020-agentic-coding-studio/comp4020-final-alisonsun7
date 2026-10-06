import { escapeHtml, page } from "./html.js";
import { MAX_PARTICIPANTS, MIN_TO_START, type Participant, type Proposal, type Room } from "./rooms.js";
import { CATEGORIES, type Category } from "./validation.js";

// Static examples only — never saved, never mistaken for a real contribution.
const INSPIRATION: Record<Category, string> = {
  WHERE: "e.g. National Zoo, the lake, a day hike",
  EAT: "e.g. Korean BBQ, a picnic, ramen",
  DO: "e.g. Bowling, mini golf, board games",
};

export type RecentRoom =
  | { kind: "none" }
  | { kind: "stale" }
  | { kind: "active"; code: string; title: string; nickname: string; phase: string };

function recentRoomBlock(recent: RecentRoom): string {
  if (recent.kind === "none") return "";
  if (recent.kind === "stale") {
    return `<section>
<h2>Welcome back</h2>
<p>We couldn't find your saved room — clearing browser storage loses automatic identity recovery. Join using a room code below.</p>
</section>`;
  }
  return `<section>
<h2>Welcome back, ${escapeHtml(recent.nickname)}</h2>
<p><strong>${escapeHtml(recent.title)}</strong> — stage: ${recent.phase === "planning" ? "planning" : "collecting ideas"}</p>
<p><a href="/rooms/${escapeHtml(recent.code)}">Continue</a></p>
</section>`;
}

export function homePage(
  opts: {
    recentRoom?: RecentRoom;
    createError?: string;
    createValues?: { title?: string; nickname?: string };
    joinError?: string;
    joinValues?: { code?: string; nickname?: string };
  } = {},
): string {
  const recent = opts.recentRoom ?? { kind: "none" };
  const createError = opts.createError
    ? `<p role="alert" class="error">${escapeHtml(opts.createError)}</p>`
    : "";
  const joinError = opts.joinError ? `<p role="alert" class="error">${escapeHtml(opts.joinError)}</p>` : "";

  return page(
    "DayDraw",
    `<main>
<h1>DayDraw</h1>
<p>Plan a day together.</p>
<p>Split the thinking. Share the ideas.</p>
<p>Designed for groups of up to 12. Start with 2.</p>
<p>A room divides ideas into <strong>WHERE</strong>, <strong>EAT</strong> and <strong>DO</strong> — a drawn card suggests which to focus on, it does not restrict what you can see or add.</p>

${recentRoomBlock(recent)}

<form method="post" action="/rooms">
<h2>Create a room</h2>
${createError}
<p>
<label for="title">Room title</label><br />
<input id="title" name="title" maxlength="60" required autocomplete="off" value="${escapeHtml(opts.createValues?.title ?? "")}" />
</p>
<p>
<label for="nickname">Your nickname</label><br />
<input id="nickname" name="nickname" maxlength="30" required autocomplete="off" value="${escapeHtml(opts.createValues?.nickname ?? "")}" />
</p>
<button type="submit">Create room</button>
</form>

<form method="post" action="/join">
<h2>Join a room</h2>
${joinError}
<p>
<label for="code">Room code</label><br />
<input id="code" name="code" maxlength="20" required autocomplete="off" value="${escapeHtml(opts.joinValues?.code ?? "")}" />
</p>
<p>
<label for="join-nickname">Your nickname</label><br />
<input id="join-nickname" name="nickname" maxlength="30" required autocomplete="off" value="${escapeHtml(opts.joinValues?.nickname ?? "")}" />
</p>
<button type="submit">Join room</button>
</form>

<p><a href="/readme/">Read our approach</a></p>
</main>`,
  );
}

export function notFoundPage(): string {
  return page(
    "DayDraw — room not found",
    `<main>
<h1>Room not found</h1>
<p>No room matches that code.</p>
<p><a href="/">Back to DayDraw</a></p>
</main>`,
  );
}

export function errorPage(title: string, message: string): string {
  return page(
    `DayDraw — ${title}`,
    `<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/">Back to DayDraw</a></p>
</main>`,
  );
}

function boardList(category: Category, proposals: Proposal[], roleCounts: Record<Category, number>): string {
  const items = proposals
    .filter((p) => p.category === category)
    .map(
      (p) =>
        `<li>${escapeHtml(p.title)} <span class="author">— ${escapeHtml(p.authorNickname)}</span></li>`,
    )
    .join("\n");
  const shared = roleCounts[category] === 0 ? ` <span class="shared">(shared — no one's assigned here yet)</span>` : "";
  return `<section>
<h3>${category}${shared}</h3>
<p class="inspiration">${INSPIRATION[category]}</p>
<ul data-category="${category}">
${items || "<li><em>No ideas yet.</em></li>"}
</ul>
</section>`;
}

function participantList(participants: Participant[], viewer: Participant | undefined): string {
  const items = participants
    .map((p) => {
      const role = p.role ?? "unassigned";
      const you = viewer && p.id === viewer.id ? " (you)" : "";
      return `<li>${escapeHtml(p.nickname)}${you} — ${escapeHtml(role)}</li>`;
    })
    .join("\n");
  return `<ul>${items}</ul>`;
}

function stageLine(phase: string): string {
  const current = phase === "planning" ? "Planning" : "Ideas";
  return `<p class="stage">Stage: Draw (done) &rarr; ${current} (current) &rarr; Vote (later) &rarr; Reveal (later)</p>`;
}

function startBlock(room: Room, participantCount: number, viewer: Participant | undefined): string {
  if (!viewer) return "";
  if (room.phase === "planning") {
    return `<p>This room has started planning together.</p>`;
  }
  if (participantCount < MIN_TO_START) {
    return `<p>Starting becomes available once a second person joins. Saving ideas doesn't need to wait for that.</p>`;
  }
  return `<form method="post" action="/rooms/${escapeHtml(room.code)}/start">
<button type="submit">Start planning together</button>
</form>`;
}

export function roomPage(opts: {
  room: Room;
  proposals: Proposal[];
  participants: Participant[];
  viewer?: Participant;
}): string {
  const { room, proposals, participants, viewer } = opts;
  const roleCounts: Record<Category, number> = { WHERE: 0, EAT: 0, DO: 0 };
  for (const p of participants) if (p.role) roleCounts[p.role]++;

  const ideaForm = viewer
    ? `<form id="idea-form" data-room-code="${escapeHtml(room.code)}">
<h2>Add an idea</h2>
<p>
<label for="idea-category">Category</label><br />
<select id="idea-category" name="category">
${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("\n")}
</select>
</p>
<p>
<label for="idea-title">Idea</label><br />
<input id="idea-title" name="title" maxlength="120" required autocomplete="off" />
</p>
<button id="idea-submit" type="submit">Save idea</button>
<p id="idea-status" role="status" aria-live="polite"></p>
</form>
<script type="module" src="/room.js"></script>`
    : `<p>You're viewing as a visitor. Join below to add your own idea.</p>`;

  return page(
    `DayDraw — ${room.title}`,
    `<main>
<p><a href="/">&larr; Back to DayDraw</a></p>
<h1>${escapeHtml(room.title)}</h1>
<p>Room code: <code>${escapeHtml(room.code)}</code> (copy and share it to invite others)</p>
<p>${participants.length} of ${MAX_PARTICIPANTS} joined (registered members — not a live presence count)</p>
${stageLine(room.phase)}

<h2>Participants</h2>
${participantList(participants, viewer)}

${startBlock(room, participants.length, viewer)}

${ideaForm}

<h2>Board</h2>
<p><a href="/rooms/${escapeHtml(room.code)}">Refresh board</a> — this app updates on refresh, not live.</p>
<div id="board">
${CATEGORIES.map((c) => boardList(c, proposals, roleCounts)).join("\n")}
</div>
</main>`,
  );
}
