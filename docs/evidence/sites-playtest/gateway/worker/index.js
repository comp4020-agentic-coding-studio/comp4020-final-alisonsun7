// Sites owns visitor access. The Node service owns player identity and works.
const UPSTREAM = "https://comp4020-final-alisonsun7.fly.dev";
const GATEWAY = "little-chorus-sites-proxy-v1";

// Enumerated from the retained 3D release's src/server.ts; never a filesystem
// proxy. New application modules require a deliberate addition to this list.
const MODULES = new Set([
  "/client/scene.js", "/client/figures.js", "/client/characters.js",
  "/client/coastal-renderer.js", "/client/d-pines.js", "/client/world.js",
  "/client/world-build.js", "/client/sky.js", "/client/cafe.js",
  "/client/seaside.js", "/client/huts.js", "/client/guide.js",
  "/client/sound-library.js", "/client/listening-trail.js",
  "/client/look-settings.js", "/client/sound-conversations.js",
  "/client/shared-sound-place.js", "/client/sound-connections.js",
  "/client/sound-residents.js", "/client/view-mode.js", "/client/planet.js",
  "/client/chorus-studio.js", "/client/chorus-garden.js",
  "/client/chorus-instrument.js", "/client/planet-world.js",
  "/client/planet-lighting.js", "/client/planet-contact-shadows.js",
  "/client/planet-support.js", "/client/planet-build.js",
  "/client/planet-audio.js", "/client/planet-busker.js",
  "/client/planet-connections.js", "/client/planet-social.js",
  "/client/planet-sound-interactions.js", "/client/planet-locomotion.js",
  "/client/planet-wildlife.js", "/client/sound-wildlife.js",
  "/client/sound-waterlife.js", "/client/sound-pinwheels.js",
  "/client/sound-vessels.js", "/client/planet-surface-safety.js",
  "/client/resident-life.js", "/client/planet-neighbours.js",
  "/client/npc-conversation-cues.js", "/client/sound-discovery.js",
  "/client/planet-coast.js", "/client/routine-audio.js",
  "/client/environment-panel.js", "/client/places.js", "/client/soundscape.js",
  "/client/style.css", "/vendor/three.module.min.js", "/shared/catalog.js",
  "/shared/protocol.js", "/shared/sounds.js", "/shared/frog-call.js",
  "/shared/sound-response.js", "/shared/sound-life.js", "/shared/planet.js",
  "/shared/chorus.js", "/shared/chorus-guidance.js", "/shared/chorus-signature.js",
  "/shared/chorus-placement.js", "/shared/chorus-invitation.js",
  "/shared/npc-routines.js", "/shared/huts.js", "/shared/environment.js",
  "/shared/landscapes.js",
]);
const PAGES = new Set([
  "/", "/planet", "/explore", "/readme/", "/about", "/assets-manifest.json",
  "/api/scenes", "/api/stream", "/scene/seaside", "/scene/planet",
  "/2d", "/2.5d", "/planet/flat", "/planet/2d", "/planet/2.5d",
  "/project-notes/chorus-audio", "/project-notes/promise-evidence-map",
  "/project-notes/human-playtest", "/project-notes/little-chorus",
]);
const ADDON = /^\/vendor\/addons\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\.js$/;
const ASSET = /^\/assets\/(?:models|textures|skies|sounds)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:gltf|bin|jpg|png|hdr|mp3)$/;
const ACTION = /^\/api\/sessions\/ses_[a-f0-9]{16}\/(?:move|say|environment|npc-restroom)$/;
const SOUNDS = /^\/api\/sessions\/ses_[a-f0-9]{16}\/sounds$/;
const SOUND = /^\/api\/sessions\/ses_[a-f0-9]{16}\/sounds\/snd_[a-f0-9]{16}$/;
const REPLIES = /^\/api\/sessions\/ses_[a-f0-9]{16}\/sounds\/snd_[a-f0-9]{16}\/replies$/;

function allowedMethods(path) {
  if (PAGES.has(path) || MODULES.has(path) || ADDON.test(path)
      || (ASSET.test(path) && !path.includes("..")) || REPLIES.test(path)) return ["GET"];
  if (path === "/join" || path === "/leave" || ACTION.test(path) || SOUNDS.test(path)) return ["POST"];
  return SOUND.test(path) ? ["DELETE"] : [];
}

function applicationCookie(header) {
  const tokens = (header || "").split(";").map(part => part.trim())
    .filter(part => part.startsWith("soac_session="));
  // Ambiguous duplicate tokens fail closed. Outer Sites cookies stay private.
  return tokens.length === 1 && /^soac_session=[A-Za-z0-9_-]{1,256}$/.test(tokens[0]) ? tokens[0] : null;
}

function upstreamHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "content-type", "range", "if-range",
    "if-none-match", "if-modified-since", "last-event-id"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const cookie = applicationCookie(request.headers.get("cookie"));
  if (cookie) headers.set("cookie", cookie);
  headers.set("accept-encoding", "identity");
  return headers;
}

function appSetCookies(headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie()
    : typeof headers.getAll === "function" ? headers.getAll("set-cookie")
    : [headers.get("set-cookie")].filter(Boolean);
  const cookies = [];
  for (const value of values) {
    const first = value.split(";", 1)[0];
    if (!/^soac_session=[A-Za-z0-9_-]{0,256}$/.test(first)) continue;
    // Rebuild the app's contract without an upstream Domain or outer identity.
    let cookie = `${first}; Path=/; HttpOnly; SameSite=Lax; Secure`;
    const age = value.match(/;\s*Max-Age=(\d+)(?:;|$)/i);
    if (first === "soac_session=") cookie += "; Max-Age=0";
    else if (age && Number(age[1]) <= 31536000) cookie += `; Max-Age=${Number(age[1])}`;
    cookies.push(cookie);
  }
  return cookies;
}

function baseHeaders() {
  return new Headers({ "cache-control": "private, no-store, no-transform",
    "x-content-type-options": "nosniff", "x-little-chorus-gateway": GATEWAY });
}

function failure(request, status, message, code, allow) {
  const headers = baseHeaders();
  if (status === 503) headers.set("retry-after", "5");
  if (allow) headers.set("allow", allow.join(", "));
  if (new URL(request.url).pathname.startsWith("/api/")
      || (request.headers.get("accept") || "").includes("application/json")) {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ ok: false, code, message }), { status, headers });
  }
  headers.set("content-type", "text/html; charset=utf-8");
  // Only fixed authored text: no exception, query, upstream body or identity.
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Little Chorus</title><style>body{margin:0;background:#f4f0e5;color:#26473c;font:18px/1.6 system-ui}main{max-width:32rem;margin:18vh auto;padding:24px}a{display:inline-block;padding:12px 18px;background:#26473c;color:#fff;border-radius:12px}a:focus-visible{outline:3px solid #bd7627;outline-offset:4px}</style><main><h1>Little Chorus</h1><p>${message}</p><a href="/planet">Try the world again</a></main></html>`, { status, headers });
}

function translatedLocation(value, siteUrl) {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  let target;
  try { target = new URL(value, UPSTREAM); } catch { return null; }
  if (target.origin !== UPSTREAM || target.username || target.password
      || !allowedMethods(target.pathname).includes("GET")) return null;
  return siteUrl.origin + target.pathname + target.search + target.hash;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const methods = allowedMethods(url.pathname);
    if (!methods.length) return failure(request, 404, "That page is not part of this world.", "not_found");
    if (!methods.includes(request.method)) return failure(request, 405, "That action is not available here.", "method_not_allowed", methods);
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        return failure(request, 403, "Open Little Chorus and try that action there.", "cross_site_action");
      }
    }
    if (url.pathname === "/") {
      const headers = baseHeaders();
      headers.set("location", "/planet" + url.search);
      return new Response(null, { status: 303, headers });
    }
    // Assign path/search independently so queries cannot choose another host.
    const target = new URL(UPSTREAM);
    target.pathname = url.pathname;
    target.search = url.search;
    try {
      const upstream = await fetch(new Request(target, {
        method: request.method, headers: upstreamHeaders(request),
        body: request.method === "GET" ? undefined : request.body,
        // Local Node controls need duplex; Worker Request ignores unknown keys.
        ...(request.method === "GET" ? {} : { duplex: "half" }),
        redirect: "manual", signal: request.signal,
      }), { cache: "no-store" });
      if (upstream.status >= 500) {
        void upstream.body?.cancel().catch(() => {});
        return failure(request, 503, "The shared world is temporarily unavailable. Please try again shortly.", "world_unavailable");
      }
      const headers = baseHeaders();
      for (const name of ["content-type", "content-language", "content-encoding", "content-length",
        "content-range", "accept-ranges", "etag", "last-modified", "retry-after"]) {
        const value = upstream.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      for (const cookie of appSetCookies(upstream.headers)) headers.append("set-cookie", cookie);
      if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
        const location = translatedLocation(upstream.headers.get("location"), url);
        if (!location) {
          void upstream.body?.cancel().catch(() => {});
          return failure(request, 502, "The world returned an unexpected destination. Please try again shortly.", "invalid_world_redirect");
        }
        headers.set("location", location);
      }
      // No reads, cloning, parsing, cache or whole-stream timeout. Late chunks
      // stay late, and downstream cancellation can reach the original stream.
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
    } catch {
      return failure(request, 503, "The shared world is temporarily unavailable. Please try again shortly.", "world_unavailable");
    }
  },
};
