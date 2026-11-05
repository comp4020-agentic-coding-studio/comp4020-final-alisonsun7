import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { renderAbout, renderArchive, renderExplore, renderLanding, renderMemory, renderNotFound, renderReadme, renderScene } from "./html.js";
import { log } from "./log.js";
import { getMemory, listMemories } from "./memories.js";
import * as sessions from "./sessions.js";
import { SCENES, findMode, findScene } from "./shared/catalog.js";
import { AVATARS, type Avatar } from "./shared/protocol.js";
import { clearCookie, createUser, sessionCookie, userFromRequest } from "./users.js";

// Every file the browser loads. A module missing here makes a page 200 while
// rendering nothing (it happened once with NoteGrid), which is why
// spec/pages.test.ts fetches each one.
const js = (path: string): { file: URL; type: string } => ({ file: new URL(`.${path}`, import.meta.url), type: "text/javascript" });
export const STATIC: Record<string, { file: URL; type: string; cache?: string }> = {
  "/client/scene.js": js("/client/scene.js"),
  "/client/memory.js": js("/client/memory.js"),
  "/client/audio.js": js("/client/audio.js"),
  "/client/synth.js": js("/client/synth.js"),
  "/client/figures.js": js("/client/figures.js"),
  "/client/stage.js": js("/client/stage.js"),
  "/client/ops.js": js("/client/ops.js"),
  "/client/world.js": js("/client/world.js"),
  "/client/world-build.js": js("/client/world-build.js"),
  "/client/sky.js": js("/client/sky.js"),
  "/client/cafe.js": js("/client/cafe.js"),
  "/client/places.js": js("/client/places.js"),
  // three.js, the one library the browser loads (ADR 004), straight from the
  // installed package; pages map the bare "three" import to it
  "/vendor/three.module.min.js": { file: new URL("../node_modules/three/build/three.module.min.js", import.meta.url), type: "text/javascript", cache: "public, max-age=604800" },
  "/shared/catalog.js": js("/shared/catalog.js"),
  "/shared/protocol.js": js("/shared/protocol.js"),
  "/shared/state.js": js("/shared/state.js"),
  "/client/style.css": { file: new URL("./client/style.css", import.meta.url), type: "text/css" },
};

// Published scene images, processed from Wen's photos (people blurred, EXIF
// gone) by scripts/build-scenes.mjs. Looked up by name, never by path, so a
// request can't reach anything else on disk.
const PUBLIC_DIR = new URL("../public/", import.meta.url);
const SCENE_FILE = /^\/scenes\/([a-z0-9-]+\.webp)$/;

// three.js add-ons (loaders), and the CC0 models, surfaces and skies the
// places are built from (scripts/fetch-assets.mjs). Names are checked against
// a pattern with no "..", so a request can't leave these folders.
const ADDON_FILE = /^\/vendor\/addons\/((?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\.js)$/;
const ADDONS_DIR = new URL("../node_modules/three/examples/jsm/", import.meta.url);
const ASSET_FILE = /^\/assets\/((?:models|textures|skies)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(gltf|bin|jpg|png|hdr))$/;
const ASSET_TYPES: Record<string, string> = {
  gltf: "model/gltf+json",
  bin: "application/octet-stream",
  jpg: "image/jpeg",
  png: "image/png",
  hdr: "image/vnd.radiance",
};

const MAX_BODY = 4096;

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
  }
  return body;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return JSON.parse((await readBody(req)) || "null");
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    return null;
  }
}

function send(res: ServerResponse, status: number, body = "", type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

const html = (res: ServerResponse, body: string, status = 200): void => send(res, status, body, "text/html; charset=utf-8");
const json = (res: ServerResponse, status: number, body: unknown): void => send(res, status, JSON.stringify(body), "application/json; charset=utf-8");

const isAvatar = (v: unknown): v is Avatar => typeof v === "string" && (AVATARS as string[]).includes(v);

// Only same-site paths, so a join form can't be used to bounce people off
// to another site.
function safeNext(next: string | null): string {
  return next && /^\/[a-z0-9/_?=&.-]*$/i.test(next) && !next.startsWith("//") ? next : "/explore";
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const { pathname } = url;
  const method = req.method ?? "GET";
  const user = userFromRequest(req);

  const asset = STATIC[pathname];
  if (method === "GET" && asset) {
    res.writeHead(200, { "content-type": `${asset.type}; charset=utf-8`, "cache-control": asset.cache ?? "no-cache" });
    res.end(await readFile(asset.file));
    return;
  }

  const addon = method === "GET" && pathname.match(ADDON_FILE);
  if (addon) {
    try {
      const body = await readFile(new URL(addon[1], ADDONS_DIR));
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=604800" });
      res.end(body);
    } catch {
      send(res, 404, "not found");
    }
    return;
  }

  const assetFile = method === "GET" && pathname.match(ASSET_FILE);
  if (assetFile && !assetFile[1].includes("..")) {
    try {
      const body = await readFile(new URL(`assets/${assetFile[1]}`, PUBLIC_DIR));
      res.writeHead(200, { "content-type": ASSET_TYPES[assetFile[2]], "cache-control": "public, max-age=604800" });
      res.end(body);
    } catch {
      send(res, 404, "not found");
    }
    return;
  }

  const sceneFile = method === "GET" && pathname.match(SCENE_FILE);
  if (sceneFile) {
    try {
      const body = await readFile(new URL(`scenes/${sceneFile[1]}`, PUBLIC_DIR));
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=86400" });
      res.end(body);
    } catch {
      send(res, 404, "not found");
    }
    return;
  }

  if (method === "GET" && pathname === "/") return html(res, renderLanding(user));
  if (method === "GET" && pathname === "/readme/") return html(res, renderReadme());
  if (method === "GET" && pathname === "/about") return html(res, renderAbout());
  if (method === "GET" && pathname === "/explore") {
    const places = SCENES.flatMap((s) => s.modes.map((m) => ({ sceneId: s.id, mode: m.id, ...sessions.placeSummary(s.id, m.id) })));
    return html(res, renderExplore(user, places, url.searchParams.get("error")));
  }
  if (method === "GET" && pathname === "/archive") return html(res, renderArchive(listMemories()));

  const memoryPage = method === "GET" && pathname.match(/^\/memory\/(mem_[a-f0-9]{16})$/);
  if (memoryPage) {
    const memory = getMemory(memoryPage[1]);
    return memory ? html(res, renderMemory(memory)) : html(res, renderNotFound("That memory doesn't exist."), 404);
  }

  const scenePage = method === "GET" && pathname.match(/^\/scene\/([a-z-]+)$/);
  if (scenePage) {
    const scene = findScene(scenePage[1]);
    const mode = scene && findMode(scene, url.searchParams.get("mode") ?? scene.modes[0].id);
    if (!scene || !mode) return html(res, renderNotFound("That place isn't in Sound of a City."), 404);
    const shotId = scene.shots.some((s) => s.id === url.searchParams.get("shot")) ? url.searchParams.get("shot")! : scene.shots[0].id;
    const snap = sessions.snapshotFor(sessions.openSession(scene.id, mode.id), user);
    return html(res, renderScene(scene, mode, shotId, snap, user));
  }

  if (method === "POST" && pathname === "/join") {
    const form = new URLSearchParams(await readBody(req));
    const nickname = (form.get("nickname") ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
    const avatar = form.get("avatar");
    const next = safeNext(form.get("next"));
    if (!nickname || !isAvatar(avatar)) {
      res.writeHead(303, { location: `/explore?error=${encodeURIComponent("Choose a name and a cat or a dog.")}` });
      res.end();
      return;
    }
    const { user: created, token } = createUser(nickname, avatar);
    log("user_joined", { user: created.id, nickname: created.nickname, avatar });
    res.writeHead(303, { location: next, "set-cookie": sessionCookie(token) });
    res.end();
    return;
  }

  if (method === "POST" && pathname === "/leave") {
    res.writeHead(303, { location: "/explore", "set-cookie": clearCookie() });
    res.end();
    return;
  }

  // ---- JSON API (pack docs/05) ------------------------------------------

  if (method === "GET" && pathname === "/api/scenes") {
    return json(res, 200, SCENES.map((s) => ({ id: s.id, title: s.title, evidence: s.evidence, modes: s.modes.map((m) => ({ id: m.id, label: m.label })) })));
  }

  if (method === "GET" && pathname === "/api/memories") return json(res, 200, listMemories());

  const memoryApi = method === "GET" && pathname.match(/^\/api\/memories\/(mem_[a-f0-9]{16})$/);
  if (memoryApi) {
    const memory = getMemory(memoryApi[1]);
    return memory ? json(res, 200, memory) : json(res, 404, { error: "no such memory" });
  }

  // The live stream for one place. Anyone may watch; only people who've
  // joined are counted as here.
  if (method === "GET" && pathname === "/api/stream") {
    const scene = findScene(url.searchParams.get("scene") ?? "");
    const mode = scene && findMode(scene, url.searchParams.get("mode") ?? "");
    if (!scene || !mode) return json(res, 404, { error: "no such place" });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write("retry: 1500\n\n");
    sessions.subscribe(res, scene.id, mode.id, user);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      sessions.unsubscribe(res, scene.id, mode.id, user);
    });
    return;
  }

  const sessionApi = pathname.match(/^\/api\/sessions\/(ses_[a-f0-9]{16})(\/ops|\/events)?$/);
  if (method === "GET" && sessionApi && !sessionApi[2]) {
    const snap = sessions.sessionSnapshot(sessionApi[1], user);
    return snap ? json(res, 200, snap) : json(res, 404, { error: "no such session" });
  }
  if (method === "GET" && sessionApi?.[2] === "/events") {
    const since = Number(url.searchParams.get("sinceSeq") ?? 0);
    return json(res, 200, sessions.eventsSince(sessionApi[1], Number.isInteger(since) && since >= 0 ? since : 0));
  }

  if (method === "POST" && sessionApi?.[2] === "/ops") {
    // Every change needs a server-verified person; who acts comes from the
    // session cookie, never the body.
    if (!user) return json(res, 401, { ok: false, code: "no_session", message: "Join first: choose a name and a cat or a dog." });
    const result = sessions.applyOp(user, sessionApi[1], await readJson(req));
    const status = result.ok ? 200 : result.code === "no_session" ? 404 : result.code === "save_failed" ? 500 : result.code === "slow_down" ? 429 : 409;
    return json(res, result.ok ? 200 : result.code === "bad_request" ? 400 : status, result);
  }

  // Only when the app is started for the spec: makes the next memory write
  // fail, to check the page never claims a save that didn't happen.
  if (method === "POST" && pathname === "/test/fail-next-save" && process.env.SOAC_TEST_HOOKS === "1") {
    sessions.failNextSaveForTest();
    return send(res, 204);
  }

  html(res, renderNotFound("There's nothing at that address."), 404);
}

const server = createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    const status = (err as { status?: number }).status ?? 500;
    log("request_failed", { path: req.url ?? "", error: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) send(res, status, status === 413 ? "request too large" : "something went wrong");
    else res.end();
  });
});

sessions.recover();
const port = Number(process.env.PORT ?? 8080);
server.listen(port, "0.0.0.0", () => log("server_started", { port }));
