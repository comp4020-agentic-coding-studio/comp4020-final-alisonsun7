import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as garden from "./garden.js";
import { renderGarden, renderReadme, renderWelcome } from "./html.js";
import { log } from "./log.js";
import { COLS, INSTRUMENTS, NOTES, ROWS, type Instrument, type Note } from "./types.js";
import { createUser, sessionCookie, userFromRequest } from "./users.js";

// Every file the browser loads, including the modules app.js imports. A
// missing entry here breaks the whole client silently (the page still 200s),
// which is why spec/client.test.ts loads each one.
const STATIC: Record<string, { file: URL; type: string }> = {
  "/client/app.js": { file: new URL("./client/app.js", import.meta.url), type: "text/javascript" },
  "/client/audio.js": { file: new URL("./client/audio.js", import.meta.url), type: "text/javascript" },
  "/types.js": { file: new URL("./types.js", import.meta.url), type: "text/javascript" },
  "/client/style.css": { file: new URL("./client/style.css", import.meta.url), type: "text/css" },
};

const MAX_BODY = 4096;

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error("body too large");
  }
  return body;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse((await readBody(req)) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, body = "", type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

const isNote = (v: unknown): v is Note => typeof v === "string" && (NOTES as readonly string[]).includes(v);
const isInstrument = (v: unknown): v is Instrument => typeof v === "string" && (INSTRUMENTS as readonly string[]).includes(v);
const inRange = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < max;

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  const asset = STATIC[pathname];
  if (method === "GET" && asset) {
    res.writeHead(200, { "content-type": `${asset.type}; charset=utf-8`, "cache-control": "no-cache" });
    res.end(await readFile(asset.file));
    return;
  }

  if (method === "GET" && pathname === "/") {
    const user = userFromRequest(req);
    send(res, 200, user ? renderGarden(user.nickname) : renderWelcome(), "text/html; charset=utf-8");
    return;
  }

  if (method === "GET" && pathname === "/readme/") {
    send(res, 200, renderReadme(), "text/html; charset=utf-8");
    return;
  }

  if (method === "POST" && pathname === "/join") {
    const nickname = (new URLSearchParams(await readBody(req)).get("nickname") ?? "").trim().slice(0, 24);
    if (!nickname) {
      send(res, 400, renderWelcome("Please enter a name."), "text/html; charset=utf-8");
      return;
    }
    const { user, token } = createUser(nickname);
    garden.recordJoin(user);
    res.writeHead(303, { location: "/", "set-cookie": sessionCookie(token) });
    res.end();
    return;
  }

  // Everything below changes or streams the shared garden, so it needs a
  // server-verified session; the acting user comes from that, never the body.
  const user = userFromRequest(req);
  if (!user) {
    send(res, 401, "join the garden first");
    return;
  }

  if (method === "GET" && pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write("retry: 1500\n\n");
    garden.subscribe(res, user);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      garden.unsubscribe(res, user);
    });
    return;
  }

  if (method === "POST" && pathname === "/notes") {
    const body = await readJson(req);
    if (!body || !inRange(body.row, ROWS) || !inRange(body.col, COLS)) {
      send(res, 400, "row and col must be integers 0-5");
      return;
    }
    if (body.note === null) garden.removeNote(user, body.row, body.col);
    else if (isNote(body.note)) garden.placeNote(user, body.row, body.col, body.note);
    else {
      send(res, 400, "unknown note");
      return;
    }
    send(res, 204);
    return;
  }

  if (method === "POST" && pathname === "/instrument") {
    const body = await readJson(req);
    if (!body || !isInstrument(body.instrument)) {
      send(res, 400, "unknown instrument");
      return;
    }
    garden.changeInstrument(user, body.instrument);
    send(res, 204);
    return;
  }

  send(res, 404, "not found");
}

const server = createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    log("request_failed", { path: req.url ?? "", error: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) send(res, 500, "something went wrong");
    else res.end();
  });
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, "0.0.0.0", () => log("server_started", { port }));
