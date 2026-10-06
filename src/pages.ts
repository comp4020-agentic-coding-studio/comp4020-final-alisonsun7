import { escapeHtml, page } from "./html.js";
import type { Participant, Proposal, Room } from "./rooms.js";
import { CATEGORIES } from "./validation.js";

export function homePage(opts: { error?: string; title?: string; nickname?: string } = {}): string {
  const errorBlock = opts.error
    ? `<p role="alert" class="error">${escapeHtml(opts.error)}</p>`
    : "";
  return page(
    "DayDraw",
    `<main>
<h1>DayDraw</h1>
<p>Plan a day together.</p>
<p>Split the thinking. Share the ideas.</p>
<p>Designed for groups of up to 12. Start with 2.</p>
<p>A room divides ideas into <strong>WHERE</strong>, <strong>EAT</strong> and <strong>DO</strong> — a drawn card suggests which to focus on, it does not restrict what you can see or add.</p>

<form method="post" action="/rooms">
<h2>Create a room</h2>
${errorBlock}
<p>
<label for="title">Room title</label><br />
<input id="title" name="title" maxlength="60" required autocomplete="off" value="${escapeHtml(opts.title ?? "")}" />
</p>
<p>
<label for="nickname">Your nickname</label><br />
<input id="nickname" name="nickname" maxlength="30" required autocomplete="off" value="${escapeHtml(opts.nickname ?? "")}" />
</p>
<button type="submit">Create room</button>
</form>

<p>Join an existing room is being built next; this deploy proves creating a room and saving an idea are live.</p>
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

function boardList(category: string, proposals: Proposal[]): string {
  const items = proposals
    .filter((p) => p.category === category)
    .map(
      (p) =>
        `<li>${escapeHtml(p.title)} <span class="author">— ${escapeHtml(p.authorNickname)}</span></li>`,
    )
    .join("\n");
  return `<section>
<h3>${category}</h3>
<ul data-category="${category}">
${items || "<li><em>No ideas yet.</em></li>"}
</ul>
</section>`;
}

export function roomPage(opts: { room: Room; proposals: Proposal[]; viewer?: Participant }): string {
  const { room, proposals, viewer } = opts;

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
    : `<p>You're viewing as a visitor. Joining this room is being built next, so adding an idea here isn't available yet.</p>`;

  return page(
    `DayDraw — ${room.title}`,
    `<main>
<p><a href="/">&larr; Back to DayDraw</a></p>
<h1>${escapeHtml(room.title)}</h1>
<p>Room code: <code>${escapeHtml(room.code)}</code></p>

${ideaForm}

<h2>Board</h2>
<div id="board">
${CATEGORIES.map((c) => boardList(c, proposals)).join("\n")}
</div>
</main>`,
  );
}
