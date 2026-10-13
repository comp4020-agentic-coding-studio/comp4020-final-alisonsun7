import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readCookie, setCookie } from "./cookies.js";
import { renderBoard, renderHome, renderReadme } from "./html.js";
import * as state from "./state.js";
import { INSTRUMENTS, NOTES, type Instrument, type Note } from "./types.js";

const clientDir = fileURLToPath(new URL("./client/", import.meta.url));

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function isNote(value: unknown): value is Note {
  return typeof value === "string" && (NOTES as readonly string[]).includes(value);
}

function isInstrument(value: unknown): value is Instrument {
  return typeof value === "string" && (INSTRUMENTS as readonly string[]).includes(value);
}

async function serveStatic(res: ServerResponse, relativePath: string, contentType: string): Promise<void> {
  try {
    const data = await readFile(new URL(relativePath, `file://${clientDir}`));
    res.writeHead(200, { "content-type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    const nickname = readCookie(req, "nickname");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(nickname ? renderBoard(nickname) : renderHome());
    return;
  }

  if (req.method === "GET" && url.pathname === "/readme/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderReadme());
    return;
  }

  if (req.method === "GET" && url.pathname === "/client/app.js") {
    await serveStatic(res, "app.js", "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/client/style.css") {
    await serveStatic(res, "style.css", "text/css; charset=utf-8");
    return;
  }

  if (req.method === "POST" && url.pathname === "/nickname") {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const nickname = (params.get("nickname") ?? "").trim().slice(0, 24);
    if (!nickname) {
      res.writeHead(400);
      res.end("nickname required");
      return;
    }
    res.writeHead(303, { location: "/", "set-cookie": setCookie("nickname", nickname) });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("retry: 2000\n\n");
    state.subscribe(res);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      state.unsubscribe(res);
    });
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/cells/")) {
    const index = Number(url.pathname.slice("/cells/".length));
    const body = await readBody(req);
    let note: unknown;
    try {
      ({ note } = JSON.parse(body || "{}"));
    } catch {
      res.writeHead(400);
      res.end("invalid JSON");
      return;
    }
    if (note !== null && !isNote(note)) {
      res.writeHead(400);
      res.end("invalid note");
      return;
    }
    if (!state.setCell(index, note)) {
      res.writeHead(400);
      res.end("invalid cell index");
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/instrument") {
    const body = await readBody(req);
    let instrument: unknown;
    try {
      ({ instrument } = JSON.parse(body || "{}"));
    } catch {
      res.writeHead(400);
      res.end("invalid JSON");
      return;
    }
    if (!isInstrument(instrument)) {
      res.writeHead(400);
      res.end("invalid instrument");
      return;
    }
    state.setInstrument(instrument);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/play") {
    state.play();
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/stop") {
    state.stop();
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, "0.0.0.0", () => {
  console.log(`NoteGrid listening on :${port}`);
});
