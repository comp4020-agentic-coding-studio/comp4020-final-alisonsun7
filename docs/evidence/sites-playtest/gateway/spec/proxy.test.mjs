import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../worker/index.js";

const SITE = "https://private-playtest.example";
const ORIGIN = "https://comp4020-final-alisonsun7.fly.dev";
const SESSION = "ses_0123456789abcdef", SOUND = "snd_0123456789abcdef";
const request = (path, init) => new Request(SITE + path, init);
const call = req => gateway.fetch(req, {}, {});
const encoder = new TextEncoder(), decoder = new TextDecoder();
const stub = (t, handler) => t.mock.method(globalThis, "fetch", handler);

test("root preserves invitation query without an upstream call", async t => {
  stub(t, () => assert.fail("root must not fetch"));
  const res = await call(request("/?work=wrk_example&zone=green"));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/planet?work=wrk_example&zone=green");
  assert.match(res.headers.get("cache-control"), /no-store/);
  assert.match(res.headers.get("x-little-chorus-gateway"), /proxy-v1/);
});

test("only the application cookie and allowed headers go upstream", async t => {
  stub(t, async (req, options) => {
    assert.equal(req.url, ORIGIN + "/planet?zone=beach");
    assert.equal(req.headers.get("cookie"), "soac_session=app_token-123");
    for (const name of ["authorization", "oai-sites-authorization", "oai-authenticated-user-id",
      "oai-authenticated-user-email", "x-forwarded-for", "host", "origin", "referer", "x-secret"]) {
      assert.equal(req.headers.get(name), null, name);
    }
    assert.equal(req.headers.get("accept"), "text/html");
    assert.equal(req.headers.get("accept-encoding"), "identity");
    assert.equal(req.redirect, "manual");
    assert.equal(options.cache, "no-store");
    return new Response("world", { headers: { "content-type": "text/html" } });
  });
  const res = await call(request("/planet?zone=beach", { headers: {
    cookie: "sites_gate=secret_gate; soac_session=app_token-123; chatgpt=secret_identity",
    authorization: "Bearer secret", "oai-sites-authorization": "Bearer gate",
    "oai-authenticated-user-id": "secret_id", "oai-authenticated-user-email": "private@example.com",
    "x-forwarded-for": "private_ip", host: "untrusted.example", origin: SITE,
    referer: "https://private.example/secret", "x-secret": "secret", accept: "text/html",
  } }));
  assert.equal(await res.text(), "world");
});

test("duplicate and malformed application cookies fail closed", async t => {
  let count = 0;
  stub(t, async req => { count++; assert.equal(req.headers.get("cookie"), null); return new Response("world"); });
  for (const cookie of ["soac_session=one; soac_session=two", "soac_session=bad=token",
    "soac_session=", "gate=secret", "soac_session=" + "a".repeat(257)]) {
    assert.equal((await call(request("/planet", { headers: { cookie } }))).status, 200);
  }
  assert.equal(count, 5);
});

test("upstream cannot overwrite platform cookies or reveal identity headers", async t => {
  stub(t, async () => {
    const headers = new Headers({ "content-type": "application/json", "x-backend-secret": "private" });
    headers.append("set-cookie", "sites_gate=attacker; Domain=example.com; Path=/");
    headers.append("set-cookie", "soac_session=new_app-token; Domain=fly.dev; Path=/wrong; Max-Age=31536000");
    headers.append("set-cookie", "chatgpt=attacker; Path=/");
    headers.set("oai-authenticated-user-email", "private@example.com");
    return new Response('{"ok":true}', { headers });
  });
  const res = await call(request("/join", { method: "POST", body: "nickname=Player&avatar=cat" }));
  assert.deepEqual(res.headers.getSetCookie(), ["soac_session=new_app-token; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000"]);
  assert.equal(res.headers.get("x-backend-secret"), null);
  assert.equal(res.headers.get("oai-authenticated-user-email"), null);
});

test("leave clears only app identity and rewrites the local redirect", async t => {
  stub(t, async () => new Response(null, { status: 303, headers: {
    location: "/explore", "set-cookie": "soac_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  } }));
  const res = await call(request("/leave", { method: "POST" }));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), SITE + "/explore");
  assert.equal(res.headers.get("set-cookie"), "soac_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0");
});

test("SSE remains streaming with late chunks and downstream cancellation", async t => {
  let controller, cancelled = false;
  const source = new ReadableStream({
    start(c) { controller = c; c.enqueue(encoder.encode("retry: 1500\n\n")); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const upstream = new Response(source, { headers: {
    "content-type": "text/event-stream", connection: "keep-alive", "cache-control": "public, max-age=999",
  } });
  for (const method of ["text", "json", "arrayBuffer", "clone", "blob", "formData"]) {
    upstream[method] = () => assert.fail("must not consume or clone SSE: " + method);
  }
  stub(t, async req => {
    assert.equal(req.url, ORIGIN + "/api/stream?scene=planet&mode=weekday");
    assert.equal(req.headers.get("last-event-id"), "evt_previous");
    return upstream;
  });
  const res = await call(request("/api/stream?scene=planet&mode=weekday", { headers: { "last-event-id": "evt_previous" } }));
  assert.equal(res.status, 200);
  assert.equal(res.body, source);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(res.headers.get("connection"), null);
  assert.equal(res.headers.get("cache-control"), "private, no-store, no-transform");
  const reader = res.body.getReader();
  assert.equal(decoder.decode((await reader.read()).value), "retry: 1500\n\n");
  let readFinished = false;
  const pending = reader.read().then(part => { readFinished = true; return part; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(readFinished, false, "no fake event or EOF");
  controller.enqueue(encoder.encode('data: {"type":"sound_added","author":"real_player"}\n\n'));
  assert.match(decoder.decode((await pending).value), /real_player/);
  await reader.cancel();
  assert.equal(cancelled, true);
});

test("POST method, body and query survive without choosing a different host", async t => {
  const body = '{"soundId":"pond-frogs","operationKey":"test-operation","x":1,"z":2}';
  stub(t, async req => {
    assert.equal(req.url, ORIGIN + `/api/sessions/${SESSION}/sounds?source=https%3A%2F%2Fevil.example`);
    assert.equal(req.method, "POST");
    assert.equal(req.headers.get("content-type"), "application/json");
    assert.equal(await req.text(), body);
    return new Response('{"ok":true,"id":"real_sound"}', { status: 201, headers: { "content-type": "application/json" } });
  });
  const res = await call(request(`/api/sessions/${SESSION}/sounds?source=https%3A%2F%2Fevil.example`, {
    method: "POST", headers: { "content-type": "application/json", origin: SITE }, body,
  }));
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, id: "real_sound" });
});

test("cross-origin writes never touch the application", async t => {
  stub(t, () => assert.fail("cross-site write must not fetch"));
  for (const headers of [{ origin: "https://other.example" }, { "sec-fetch-site": "cross-site" }]) {
    const res = await call(request(`/api/sessions/${SESSION}/say`, { method: "POST", headers, body: '{"words":"hello"}' }));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "cross_site_action");
  }
});

test("only known public paths and their current methods reach upstream", async t => {
  stub(t, () => assert.fail("unlisted route must not fetch"));
  for (const path of ["/.env", "/data/sound-of-a-city.db", "/client/flat-world.js", "/client/unknown.js",
    "/shared/unknown.js", "/api/admin", "/project-notes/private", "/scene/private", "/assets/sounds/a..mp3",
    "/assets/%2e%2e/private.mp3", "/vendor/addons/../../package.json", "/signin-with-chatgpt"]) {
    assert.equal((await call(request(path))).status, 404, path);
  }
  const method = await call(request("/planet", { method: "POST", body: "no" }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
});

test("current 3D modules, public notes, aliases and real API patterns pass", async t => {
  let count = 0;
  stub(t, async req => { count++; return new Response(req.method); });
  for (const path of ["/client/planet-busker.js", "/shared/frog-call.js", "/vendor/addons/loaders/GLTFLoader.js",
    "/project-notes/chorus-audio", "/project-notes/human-playtest", "/project-notes/promise-evidence-map",
    "/project-notes/little-chorus", "/scene/seaside", "/scene/planet", "/2.5d", "/assets-manifest.json",
    `/api/sessions/${SESSION}/sounds/${SOUND}/replies?after=${SOUND}`]) {
    assert.equal((await call(request(path))).status, 200, path);
  }
  const res = await call(request(`/api/sessions/${SESSION}/sounds/${SOUND}`, { method: "DELETE" }));
  assert.equal(await res.text(), "DELETE");
  assert.equal(count, 13);
});

test("frog revision and binary bytes survive, without inventing partial status", async t => {
  const bytes = new Uint8Array([73, 68, 51, 0, 255, 128, 23]);
  stub(t, async req => {
    assert.equal(req.url, ORIGIN + "/assets/sounds/pond-frogs.mp3?v=a1204d6d0d10");
    assert.equal(req.headers.get("range"), "bytes=0-3");
    assert.equal(req.headers.get("if-range"), '"recording"');
    return new Response(bytes, { headers: { "content-type": "audio/mpeg", "content-length": String(bytes.length) } });
  });
  const res = await call(request("/assets/sounds/pond-frogs.mp3?v=a1204d6d0d10", {
    headers: { range: "bytes=0-3", "if-range": '"recording"' },
  }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-range"), null);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), bytes);
});

test("genuine partial content and conditional responses are preserved", async t => {
  stub(t, async req => req.headers.has("range")
    ? new Response(new Uint8Array([1, 2]), { status: 206, headers: {
      "content-type": "audio/mpeg", "content-range": "bytes 0-1/8", "accept-ranges": "bytes", "content-length": "2",
    } }) : new Response(null, { status: 304, headers: { etag: '"version"' } }));
  const partial = await call(request("/assets/sounds/guitar.mp3", { headers: { range: "bytes=0-1" } }));
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 0-1/8");
  assert.equal(partial.headers.get("accept-ranges"), "bytes");
  assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), new Uint8Array([1, 2]));
  const cached = await call(request("/client/planet.js", { headers: { "if-none-match": '"version"' } }));
  assert.equal(cached.status, 304);
  assert.equal(cached.body, null);
  assert.equal(cached.headers.get("etag"), '"version"');
});

test("only local or trusted-origin redirects are rewritten, never followed", async t => {
  const targets = ["/planet?work=wrk_test#listen", ORIGIN + "/explore?error=Try%20again"];
  let index = 0;
  stub(t, async req => {
    assert.equal(req.redirect, "manual");
    return new Response(null, { status: 303, headers: { location: targets[index++] } });
  });
  assert.equal((await call(request("/2d"))).headers.get("location"), SITE + "/planet?work=wrk_test#listen");
  assert.equal((await call(request("/2d"))).headers.get("location"), SITE + "/explore?error=Try%20again");
  assert.equal(index, 2);
});

test("external, credential-bearing or unlisted redirects fail closed", async t => {
  const targets = ["https://evil.example/planet", "//evil.example/planet",
    "https://user:secret@comp4020-final-alisonsun7.fly.dev/planet", ORIGIN + "/.env",
    "javascript:alert(1)", "/planet\\@evil.example"];
  let index = 0;
  stub(t, async () => new Response(null, { status: 302, headers: { location: targets[index++] } }));
  for (const target of targets) {
    const res = await call(request("/planet"));
    assert.equal(res.status, 502, target);
    assert.equal(res.headers.get("location"), null);
    assert.doesNotMatch(await res.text(), /evil\.example|user:secret|javascript:/);
  }
});

test("offline world gives a retry page without leaking errors or resetting identity", async t => {
  stub(t, async () => { throw new Error("private secret=TEST_SECRET email=private@example.com"); });
  const res = await call(request("/planet?work=PRIVATE_QUERY", { headers: { cookie: "soac_session=PRIVATE_COOKIE" } }));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("retry-after"), "5");
  assert.equal(res.headers.get("set-cookie"), null);
  const body = await res.text();
  assert.match(body, /temporarily unavailable/);
  assert.match(body, /Try the world again/);
  assert.doesNotMatch(body, /TEST_SECRET|private@example|PRIVATE_QUERY|PRIVATE_COOKIE|stack|ok.*true/);
});

test("upstream failures return safe API JSON without replaying a write", async t => {
  let count = 0, cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  stub(t, async () => { count++; return new Response(body, { status: 500, headers: { "set-cookie": "soac_session=unexpected; Path=/" } }); });
  const res = await call(request(`/api/sessions/${SESSION}/sounds`, { method: "POST", body: '{"operationKey":"once"}' }));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(count, 1, "must not automatically repeat a mutation");
  assert.equal(cancelled, true);
  assert.deepEqual(await res.json(), { ok: false, code: "world_unavailable", message: "The shared world is temporarily unavailable. Please try again shortly." });
});
