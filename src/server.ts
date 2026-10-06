import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFormBody, readBody } from "./body.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import { defaultDbPath, openDb } from "./db.js";
import { homePage, notFoundPage, roomPage } from "./pages.js";
import { renderReadmePage } from "./readme.js";
import {
  authenticateParticipant,
  createRoom,
  findRoomByCode,
  listProposals,
  submitProposal,
} from "./rooms.js";
import { normaliseRoomCode } from "./ids.js";
import {
  validateCategory,
  validateIdeaTitle,
  validateNickname,
  validateRequestKey,
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

const STATIC_JS: Record<string, string> = {
  "/room.js": join(__dirname, "client", "room.js"),
  "/submit-state.js": join(__dirname, "client", "submit-state.js"),
};

async function handleCreateRoom(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  const form = parseFormBody(raw);

  const title = validateRoomTitle(form.title);
  const nickname = validateNickname(form.nickname);

  if (!title.ok) {
    sendHtml(res, 400, homePage({ error: title.error, nickname: form.nickname }));
    return;
  }
  if (!nickname.ok) {
    sendHtml(res, 400, homePage({ error: nickname.error, title: form.title }));
    return;
  }

  const { room, credential } = createRoom(db, { title: title.value, nickname: nickname.value });
  const secure = isHttps(req);
  res.writeHead(303, {
    location: `/rooms/${room.code}`,
    "set-cookie": [
      serializeCookie("dd_room", room.code, { secure }),
      serializeCookie("dd_credential", credential, { secure }),
    ],
  });
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
  sendHtml(res, 200, roomPage({ room, proposals, viewer }));
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
        sendHtml(res, 200, homePage());
        return;
      }

      if (url.pathname in STATIC_JS && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        res.end(readFileSync(STATIC_JS[url.pathname]));
        return;
      }

      if ((url.pathname === "/readme" || url.pathname === "/readme/") && req.method === "GET") {
        const markdown = readFileSync(readmePath, "utf8");
        sendHtml(res, 200, renderReadmePage(markdown));
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
