import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { renderAbout, renderExplore, renderLanding, renderNotFound, renderReadme, renderScene } from "./html.js";
import { log } from "./log.js";
import * as sessions from "./sessions.js";
import { SCENES, findMode, findScene, findZone, liveMode } from "./shared/catalog.js";
import { AVATARS, type Avatar } from "./shared/protocol.js";
import { clearCookie, createUser, sessionCookie, userFromRequest } from "./users.js";

// Every file the browser loads. A module missing here makes a page 200 while
// rendering nothing (it happened once with NoteGrid), which is why
// spec/pages.test.ts fetches each one.
const js = (path: string): { file: URL; type: string } => ({ file: new URL(`.${path}`, import.meta.url), type: "text/javascript" });
export const STATIC: Record<string, { file: URL; type: string; cache?: string }> = {
  "/client/scene.js": js("/client/scene.js"),
  "/client/figures.js": js("/client/figures.js"),
  "/client/world.js": js("/client/world.js"),
  "/client/world-build.js": js("/client/world-build.js"),
  "/client/sky.js": js("/client/sky.js"),
  "/client/cafe.js": js("/client/cafe.js"),
  "/client/seaside.js": js("/client/seaside.js"),
  "/client/huts.js": js("/client/huts.js"),
  "/client/guide.js": js("/client/guide.js"),
  "/client/sound-library.js": js("/client/sound-library.js"),
  "/client/listening-trail.js": js("/client/listening-trail.js"),
  "/client/look-settings.js": js("/client/look-settings.js"),
  "/client/places.js": js("/client/places.js"),
  // three.js, the one library the browser loads (ADR 004), straight from the
  // installed package; pages map the bare "three" import to it
  "/vendor/three.module.min.js": { file: new URL("../node_modules/three/build/three.module.min.js", import.meta.url), type: "text/javascript", cache: "public, max-age=604800" },
  "/shared/catalog.js": js("/shared/catalog.js"),
  "/shared/protocol.js": js("/shared/protocol.js"),
  "/shared/sounds.js": js("/shared/sounds.js"),
  "/shared/huts.js": js("/shared/huts.js"),
  "/client/soundscape.js": js("/client/soundscape.js"),
  "/client/style.css": { file: new URL("./client/style.css", import.meta.url), type: "text/css" },
};

const PUBLIC_DIR = new URL("../public/", import.meta.url);

// three.js add-ons (loaders), the CC0 models, surfaces and skies the places
// are built from (scripts/fetch-assets.mjs), and the sounds people can leave
// in them (scripts/fetch-sounds.mjs). Names are checked against
// a pattern with no "..", so a request can't leave these folders.
const ADDON_FILE = /^\/vendor\/addons\/((?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\.js)$/;
const ADDONS_DIR = new URL("../node_modules/three/examples/jsm/", import.meta.url);
const ASSET_FILE = /^\/assets\/((?:models|textures|skies|sounds)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(gltf|bin|jpg|png|hdr|mp3))$/;
const ASSET_TYPES: Record<string, string> = {
  gltf: "model/gltf+json",
  bin: "application/octet-stream",
  jpg: "image/jpeg",
  png: "image/png",
  hdr: "image/vnd.radiance",
  mp3: "audio/mpeg",
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

  if (method === "GET" && pathname === "/") return html(res, renderLanding(user));
  if (method === "GET" && pathname === "/readme/") return html(res, renderReadme());
  if (method === "GET" && pathname === "/about") return html(res, renderAbout());
  if (method === "GET" && pathname === "/explore") {
    const places = SCENES.flatMap((s) => s.modes.map((m) => ({ sceneId: s.id, mode: m.id, ...sessions.placeSummary(s.id, m.id) })));
    return html(res, renderExplore(user, places, url.searchParams.get("error")));
  }

  const scenePage = method === "GET" && pathname.match(/^\/scene\/([a-z-]+)$/);
  if (scenePage) {
    const scene = findScene(scenePage[1]);
    const asked = url.searchParams.get("mode") ?? scene?.modes[0].id ?? "";
    const mode = scene && findMode(scene, asked);
    // a time of day that was retired (ADR 012): the same place, as it is now
    if (scene && !mode && scene.retiredModes.includes(asked)) {
      url.searchParams.set("mode", scene.modes[0].id);
      res.writeHead(301, { location: `${pathname}?${url.searchParams}` });
      res.end();
      return;
    }
    if (!scene || !mode) return html(res, renderNotFound("That place isn't in Sound of a City."), 404);
    // ?zone= (or the older ?shot=) picks where you arrive
    const zoneAsked = url.searchParams.get("zone") ?? url.searchParams.get("shot") ?? "";
    const zone = findZone(scene, zoneAsked) ?? scene.zones[0];
    const snap = sessions.snapshotFor(sessions.openSession(scene.id, mode.id), user);
    return html(res, renderScene(scene, mode, zone.id, snap, user));
  }

  if (method === "POST" && pathname === "/join") {
    const form = new URLSearchParams(await readBody(req));
    const nickname = (form.get("nickname") ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
    const avatar = form.get("avatar");
    const next = safeNext(form.get("next"));
    // The arrival card joins without leaving the page, and asks for JSON.
    const wantsJson = (req.headers.accept ?? "").includes("application/json");
    if (!nickname || !isAvatar(avatar)) {
      if (wantsJson) return json(res, 400, { ok: false, error: "Choose a name and a cat or a dog." });
      res.writeHead(303, { location: `/explore?error=${encodeURIComponent("Choose a name and a cat or a dog.")}` });
      res.end();
      return;
    }
    const { user: created, token } = createUser(nickname, avatar);
    log("user_joined", { user: created.id, nickname: created.nickname, avatar });
    if (wantsJson) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "set-cookie": sessionCookie(token) });
      res.end(JSON.stringify({ ok: true, name: created.nickname, avatar }));
      return;
    }
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
    return json(res, 200, SCENES.map((s) => ({ id: s.id, title: s.title, modes: s.modes.map((m) => ({ id: m.id, label: m.label })) })));
  }

  // The live stream for one place. Anyone may watch; only people who've
  // joined are counted as here.
  if (method === "GET" && pathname === "/api/stream") {
    const scene = findScene(url.searchParams.get("scene") ?? "");
    const mode = scene && liveMode(scene, url.searchParams.get("mode") ?? "");
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

  const sessionApi = pathname.match(/^\/api\/sessions\/(ses_[a-f0-9]{16})\/(move|say)$/);
  // Where a person stands, and something they say to whoever is near (ADR
  // 007). Who it is comes from the cookie, as for every change.
  if (method === "POST" && sessionApi) {
    if (!user) return json(res, 401, { ok: false, code: "no_session" });
    const body = await readJson(req);
    const result = sessionApi[2] === "move" ? sessions.move(user, sessionApi[1], body) : sessions.say(user, sessionApi[1], body);
    const status = result.ok ? 200 : result.code === "no_session" ? 404 : result.code === "slow_down" ? 429 : result.code === "bad_request" ? 400 : 409;
    return json(res, status, result);
  }

  // Leaving a sound where you stand, and removing one you stand beside
  // (ADR 011).
  const repliesApi = pathname.match(/^\/api\/sessions\/(ses_[a-f0-9]{16})\/sounds\/(snd_[a-f0-9]{16})\/replies$/);
  if (method === "GET" && repliesApi) {
    const result = sessions.soundReplies(repliesApi[1], repliesApi[2], url.searchParams.get("after") ?? undefined);
    return json(res, result.ok ? 200 : result.code === "bad_request" ? 400 : result.code === "reply_private" ? 409 : 404, result);
  }
  const soundApi = pathname.match(/^\/api\/sessions\/(ses_[a-f0-9]{16})\/sounds(?:\/(snd_[a-f0-9]{16}))?$/);
  if (soundApi && ((method === "POST" && !soundApi[2]) || (method === "DELETE" && soundApi[2]))) {
    if (!user) return json(res, 401, { ok: false, code: "no_session" });
    const result = soundApi[2] ? sessions.removeSound(user, soundApi[1], soundApi[2]) : sessions.leaveSound(user, soundApi[1], await readJson(req));
    const status = result.ok ? (soundApi[2] || ("replayed" in result && result.replayed) ? 200 : 201) : result.code === "no_session" ? 404 : result.code === "slow_down" ? 429 : result.code === "bad_request" ? 400 : 409;
    return json(res, status, result);
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

const port = Number(process.env.PORT ?? 8080);
server.listen(port, "0.0.0.0", () => log("server_started", { port }));
