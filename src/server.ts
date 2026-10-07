import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFormBody, readBody } from "./body.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import { defaultDbPath, openDb } from "./db.js";
import { notifyRoom, subscribe } from "./live.js";
import { errorPage, homePage, notFoundPage, roomPage, type RecentRoom } from "./pages.js";
import { renderReadmePage } from "./readme.js";
import {
  authenticateParticipant,
  buildRoomSnapshot,
  createRoom,
  findRoomByCode,
  joinRoom,
  listParticipants,
  listProposals,
  startRoom,
  submitProposal,
} from "./rooms.js";
import { normaliseRoomCode } from "./ids.js";
import {
  validateCategory,
  validateIdeaTitle,
  validateNickname,
  validateRequestKey,
  validateRoomCode,
  validateRoomTitle,
} from "./validation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readmePath = join(__dirname, "..", "README.md");

const db = openDb(defaultDbPath());

const isHttps = (req: IncomingMessage): boolean => req.headers["x-forwarded-proto"] === "https";

const sendHtml = (res: ServerResponse, status: number, body: string): void => {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
};

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const STATIC_ASSETS: Record<string, { path: string; contentType: string }> = {
  "/room.js": { path: join(__dirname, "client", "room.js"), contentType: "text/javascript; charset=utf-8" },
  "/submit-state.js": {
    path: join(__dirname, "client", "submit-state.js"),
    contentType: "text/javascript; charset=utf-8",
  },
  "/live.js": { path: join(__dirname, "client", "live.js"), contentType: "text/javascript; charset=utf-8" },
  "/style.css": { path: join(__dirname, "client", "style.css"), contentType: "text/css; charset=utf-8" },
};

function setIdentityCookies(res: ServerResponse, secure: boolean, roomCode: string, credential: string): void {
  res.setHeader("set-cookie", [
    serializeCookie("dd_room", roomCode, { secure }),
    serializeCookie("dd_credential", credential, { secure }),
  ]);
}

function recentRoomFromCookies(req: IncomingMessage): RecentRoom {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.dd_room || !cookies.dd_credential) return { kind: "none" };

  const room = findRoomByCode(db, cookies.dd_room);
  const viewer = room && authenticateParticipant(db, room.id, cookies.dd_credential);
  if (!room || !viewer) return { kind: "stale" };

  return { kind: "active", code: room.code, title: room.title, nickname: viewer.nickname, phase: room.phase };
}

async function handleCreateRoom(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  const form = parseFormBody(raw);

  const title = validateRoomTitle(form.title);
  const nickname = validateNickname(form.nickname);

  if (!title.ok) {
    sendHtml(res, 400, homePage({ createError: title.error, createValues: { nickname: form.nickname } }));
    return;
  }
  if (!nickname.ok) {
    sendHtml(res, 400, homePage({ createError: nickname.error, createValues: { title: form.title } }));
    return;
  }

  const result = createRoom(db, { title: title.value, nickname: nickname.value });
  if (result.outcome === "full") {
    // Unreachable for a brand-new room (starts at 0 participants); kept so
    // createRoom's return type doesn't lie about what addParticipant can do.
    sendHtml(res, 500, homePage({ createError: "Could not create the room. Try again." }));
    return;
  }
  notifyRoom(result.room.id);

  setIdentityCookies(res, isHttps(req), result.room.code, result.credential);
  res.writeHead(303, { location: `/rooms/${result.room.code}` });
  res.end();
}

async function handleJoinRoom(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  const form = parseFormBody(raw);

  const codeInput = validateRoomCode(form.code);
  const nickname = validateNickname(form.nickname);

  if (!codeInput.ok) {
    sendHtml(res, 400, homePage({ joinError: codeInput.error, joinValues: { nickname: form.nickname } }));
    return;
  }
  if (!nickname.ok) {
    sendHtml(res, 400, homePage({ joinError: nickname.error, joinValues: { code: form.code } }));
    return;
  }

  const code = normaliseRoomCode(codeInput.value);
  const room = findRoomByCode(db, code);
  if (!room) {
    sendHtml(res, 404, homePage({ joinError: "No room matches that code.", joinValues: { code: form.code, nickname: form.nickname } }));
    return;
  }

  const result = joinRoom(db, room.id, nickname.value);
  if (result.outcome === "full") {
    sendHtml(res, 409, homePage({ joinError: "That room is full (12 of 12).", joinValues: { code: form.code, nickname: form.nickname } }));
    return;
  }
  notifyRoom(room.id);

  setIdentityCookies(res, isHttps(req), room.code, result.credential);
  res.writeHead(303, { location: `/rooms/${room.code}` });
  res.end();
}

function handleRoomPage(req: IncomingMessage, res: ServerResponse, codeParam: string): void {
  const code = normaliseRoomCode(codeParam);
  const room = findRoomByCode(db, code);
  if (!room) {
    sendHtml(res, 404, notFoundPage());
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const viewer =
    cookies.dd_room === room.code
      ? authenticateParticipant(db, room.id, cookies.dd_credential)
      : undefined;

  const proposals = listProposals(db, room.id);
  const participants = listParticipants(db, room.id);
  sendHtml(res, 200, roomPage({ room, proposals, participants, viewer }));
}

// Live membership/proposal/phase stream (M1). Read access matches the room
// page's existing viewing policy — anyone who has the room code, no
// credential required — since the board itself is already visible to
// anonymous visitors (DD05); this stream adds no new read capability, only
// a live one, and never carries a credential or (once built) a vote mapping.
function handleRoomEvents(req: IncomingMessage, res: ServerResponse, codeParam: string): void {
  const code = normaliseRoomCode(codeParam);
  const room = findRoomByCode(db, code);
  if (!room) {
    sendJson(res, 404, { error: "Room not found." });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  // Short native retry: a dropped connection (offline, redeploy) resumes
  // quickly, and every reconnect re-subscribes then re-sends a fresh
  // snapshot below — that's the whole reconnect story, no replay log needed.
  res.write("retry: 2000\n\n");

  const send = (): void => {
    if (res.writableEnded || res.destroyed) {
      unsubscribe();
      return;
    }
    // Re-read by code, not a cached room object: a stale room row would
    // publish a stale revision forever. Subscribing happens before this is
    // ever called, including for the very first send below, so no commit
    // between "start listening" and "read current state" can be missed —
    // and since node:sqlite is synchronous, nothing else can run between
    // those two lines in the same tick anyway.
    const fresh = findRoomByCode(db, code);
    if (!fresh) return;
    const snapshot = buildRoomSnapshot(db, fresh);
    try {
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    } catch {
      unsubscribe();
    }
  };

  const unsubscribe = subscribe(room.id, send);
  send();

  req.on("close", unsubscribe);
}

function handleStartRoom(req: IncomingMessage, res: ServerResponse, codeParam: string): void {
  const code = normaliseRoomCode(codeParam);
  const room = findRoomByCode(db, code);
  if (!room) {
    sendHtml(res, 404, notFoundPage());
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const viewer =
    cookies.dd_room === room.code
      ? authenticateParticipant(db, room.id, cookies.dd_credential)
      : undefined;
  if (!viewer) {
    sendHtml(res, 401, errorPage("Join this room first", "You need to be a member of this room to start it."));
    return;
  }

  const result = startRoom(db, room.id); // idempotent either way; the room page explains why if it didn't change phase
  if (result === "started") notifyRoom(room.id);
  res.writeHead(303, { location: `/rooms/${room.code}` });
  res.end();
}

async function handleSubmitProposal(
  req: IncomingMessage,
  res: ServerResponse,
  codeParam: string,
): Promise<void> {
  const code = normaliseRoomCode(codeParam);
  const room = findRoomByCode(db, code);
  if (!room) {
    sendJson(res, 404, { error: "Room not found." });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const viewer =
    cookies.dd_room === room.code
      ? authenticateParticipant(db, room.id, cookies.dd_credential)
      : undefined;
  if (!viewer) {
    sendJson(res, 401, { error: "Join this room first." });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Request body must be JSON." });
    return;
  }
  const body = (parsed ?? {}) as Record<string, unknown>;

  const category = validateCategory(body.category);
  if (!category.ok) {
    sendJson(res, 400, { error: category.error });
    return;
  }
  const title = validateIdeaTitle(body.title);
  if (!title.ok) {
    sendJson(res, 400, { error: title.error });
    return;
  }
  const requestKey = validateRequestKey(body.requestKey);
  if (!requestKey.ok) {
    sendJson(res, 400, { error: requestKey.error });
    return;
  }

  const result = submitProposal(db, {
    roomId: room.id,
    participantId: viewer.id,
    authorNickname: viewer.nickname,
    category: category.value,
    title: title.value,
    requestKey: requestKey.value,
  });

  if (result.outcome === "conflict") {
    sendJson(res, 409, { error: "This request key was already used for a different idea." });
    return;
  }
  if (result.outcome === "created") notifyRoom(room.id);

  sendJson(res, result.outcome === "created" ? 201 : 200, {
    id: result.proposal.id,
    category: result.proposal.category,
    title: result.proposal.title,
    authorNickname: result.proposal.authorNickname,
    createdAt: result.proposal.createdAt,
  });
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", "http://internal");
    const segments = url.pathname.split("/").filter(Boolean);

    try {
      if (segments.length === 0 && req.method === "GET") {
        sendHtml(res, 200, homePage({ recentRoom: recentRoomFromCookies(req) }));
        return;
      }

      if (url.pathname in STATIC_ASSETS && req.method === "GET") {
        const asset = STATIC_ASSETS[url.pathname];
        res.writeHead(200, { "content-type": asset.contentType });
        res.end(readFileSync(asset.path));
        return;
      }

      if ((url.pathname === "/readme" || url.pathname === "/readme/") && req.method === "GET") {
        const markdown = readFileSync(readmePath, "utf8");
        sendHtml(res, 200, renderReadmePage(markdown));
        return;
      }

      if (segments[0] === "join" && segments.length === 1 && req.method === "POST") {
        await handleJoinRoom(req, res);
        return;
      }

      if (segments[0] === "rooms" && segments.length === 1 && req.method === "POST") {
        await handleCreateRoom(req, res);
        return;
      }

      if (segments[0] === "rooms" && segments.length === 2 && req.method === "GET") {
        handleRoomPage(req, res, segments[1]);
        return;
      }

      if (segments[0] === "rooms" && segments.length === 3 && segments[2] === "proposals" && req.method === "POST") {
        await handleSubmitProposal(req, res, segments[1]);
        return;
      }

      if (segments[0] === "rooms" && segments.length === 3 && segments[2] === "start" && req.method === "POST") {
        handleStartRoom(req, res, segments[1]);
        return;
      }

      if (segments[0] === "rooms" && segments.length === 3 && segments[2] === "events" && req.method === "GET") {
        handleRoomEvents(req, res, segments[1]);
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("internal error");
    }
  })();
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, "0.0.0.0", () => {
  console.log(`DayDraw listening on 0.0.0.0:${port}`);
});
