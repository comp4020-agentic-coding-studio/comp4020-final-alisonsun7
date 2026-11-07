#!/usr/bin/env node
// Real HTTP/SSE and two authenticated cookie jars, including actual server
// process replacement. This script compiles its own build, creates its own
// temporary database and owns its port. It never takes APP_URL or DB_PATH.
// node e2e/chorus-persistence.mjs [evidence-directory]
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.CHORUS_TEST_PORT ?? 18886);
assert.ok(Number.isInteger(port) && port > 1023 && port < 65536, "use a valid scratch port");
assert.ok(![18861, 18884, 18885].includes(port), "never use a working preview or another review's port");
const base = `http://127.0.0.1:${port}`;
const out = process.argv[2] && resolve(process.argv[2]);
if (out) mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "little-chorus-process-"));
const app = join(scratch, "app"), databasePath = join(scratch, "world.db");
mkdirSync(app);
let child;
let serverLog = "";
const streams = [];
const result = { kind: "developer HTTP/SSE and process-restart check", base, independentCookieJars: 2, browserUI: false, audioAudition: false, pids: [], updateLatenciesMs: [], checks: [] };
const check = (condition, message) => { assert.ok(condition, message); result.checks.push(message); console.log(`ok  ${message}`); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "0.0.0.0", resolve); });
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
}
async function start() {
  await freePort();
  child = spawn(process.execPath, [join(app, "dist", "server.js")], { cwd: app, env: { ...process.env, PORT: String(port), DB_PATH: databasePath }, stdio: ["ignore", "pipe", "pipe"] });
  result.pids.push(child.pid);
  child.stdout.on("data", chunk => { serverLog += chunk.toString(); });
  child.stderr.on("data", chunk => { serverLog += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`scratch server exited before health check: ${serverLog}`);
    try { const response = await fetch(`${base}/api/scenes`); if (response.ok) return; } catch { /* process still starting */ }
    await wait(30);
  }
  throw new Error("scratch server did not become healthy");
}
async function stop() {
  for (const stream of streams.splice(0)) stream.close();
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const running = child;
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { running.kill("SIGKILL"); reject(new Error("scratch server ignored SIGTERM")); }, 3000);
    running.once("close", () => { clearTimeout(deadline); resolve(); });
    running.kill("SIGTERM");
  });
}
async function joinPerson(name) {
  const response = await fetch(`${base}/join`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ nickname: name, avatar: "cat", next: "/planet" }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("soac_session="), "joining creates a real session cookie");
  return { name, cookie };
}
async function openStream(who) {
  const controller = new AbortController(), messages = [];
  const response = await fetch(`${base}/api/stream?scene=planet&mode=weekday`, { headers: { cookie: who.cookie }, signal: controller.signal });
  assert.equal(response.status, 200);
  const decoder = new TextDecoder();
  let buffer = "", failure;
  const reading = (async () => {
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = block.split("\n").filter(line => line.startsWith("data: ")).map(line => line.slice(6)).join("\n");
          if (data) messages.push({ at: performance.now(), message: JSON.parse(data) });
        }
      }
    } catch (error) { if (!controller.signal.aborted) failure = error; }
  })();
  const stream = {
    messages,
    close() { controller.abort(); },
    async next(predicate, from = 0) {
      const deadline = performance.now() + 2000;
      while (performance.now() < deadline) {
        if (failure) throw failure;
        const found = messages.slice(from).find(entry => predicate(entry.message));
        if (found) return found;
        await wait(5);
      }
      throw new Error(`SSE did not deliver the expected change; received ${messages.map(entry => entry.message.type).join(", ")}`);
    },
    reading,
  };
  streams.push(stream);
  stream.snapshot = (await stream.next(message => message.type === "snapshot")).message;
  return stream;
}
async function api(who, sessionId, path, method, body) {
  const response = await fetch(`${base}/api/sessions/${sessionId}/${path}`, { method, headers: { cookie: who.cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, ...await response.json() };
}
async function move(who, sessionId, x, z) {
  assert.equal((await api(who, sessionId, "move", "POST", { x, z, yaw: 0 })).status, 200);
}
async function receivedTogether(a, b, predicate, began) {
  const [first, second] = await Promise.all([a.next(predicate), b.next(predicate)]);
  assert.deepEqual(first.message.chorus, second.message.chorus);
  for (const event of [first, second]) {
    const latency = Math.round((event.at - began) * 100) / 100;
    result.updateLatenciesMs.push(latency);
    assert.ok(latency >= 0 && latency <= 1000, `local SSE update exceeded 1s: ${latency}ms`);
  }
  return first.message.chorus;
}
function allRows() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => ({ name, rows: database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort() }));
  } finally { database.close(); }
}
const rowHash = rows => createHash("sha256").update(JSON.stringify(rows)).digest("hex");

try {
  // The candidate is compiled independently: no replacement of dist/ or of
  // any existing server's files, and no dependency on another suite's DB.
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(root, "tsconfig.build.json"), "--outDir", join(app, "dist")], { cwd: root, stdio: "pipe" });
  copyFileSync(join(root, "src/client/style.css"), join(app, "dist/client/style.css"));
  symlinkSync(join(root, "node_modules"), join(app, "node_modules"), "dir");
  symlinkSync(join(root, "public"), join(app, "public"), "dir");
  copyFileSync(join(root, "README.md"), join(app, "README.md"));
  writeFileSync(join(app, "package.json"), '{"type":"module"}\n');
  await start();
  const ada = await joinPerson("Persistence Ada"), bo = await joinPerson("Persistence Bo");
  assert.notEqual(ada.cookie, bo.cookie);
  let a = await openStream(ada), alias = await openStream(ada), b = await openStream(bo);
  const sessionId = a.snapshot.sessionId, adaId = a.snapshot.you.id, boId = b.snapshot.you.id;
  check(adaId === alias.snapshot.you.id && adaId !== boId && b.snapshot.online.length === 2, "two cookie jars identify two people; a shared-cookie stream remains the same person");
  await move(ada, sessionId, 0, 0); await move(bo, sessionId, 1.3, 0);
  const source = await api(ada, sessionId, "sounds", "POST", { soundId: "guitar", operationId: "process-root-source" });
  assert.equal(source.status, 201);
  await wait(1100);
  await move(ada, sessionId, 1, 1);
  const own = await api(ada, sessionId, "sounds", "POST", { soundId: "hand-claps", replyToId: source.sound.id, operationId: "process-own-answer" });
  assert.equal(own.status, 201);
  check(own.chorus.length === 1 && !own.chorus[0].duet, "one person's own answer changes an instrument without pretending to be a duet");
  const request = { soundId: "trickle", replyToId: source.sound.id, operationId: "process-friend-answer" };
  const began = performance.now();
  const duplicate = await Promise.all([api(bo, sessionId, "sounds", "POST", request), api(bo, sessionId, "sounds", "POST", request)]);
  assert.deepEqual(duplicate.map(reply => reply.status).sort(), [200, 201]);
  assert.equal(duplicate[0].sound.id, duplicate[1].sound.id);
  const answerId = duplicate[0].sound.id;
  const canonical = await receivedTogether(a, b, message => message.type === "sound-left" && message.sound.id === answerId, began);
  check(canonical.length === 1 && canonical[0].duet && canonical[0].variant === "ensemble" && canonical[0].sources.length === 3, "a real friend's answer opens one identical three-source work in both streams within one second");
  check(a.messages.filter(entry => entry.message.type === "sound-left" && entry.message.sound.id === answerId).length === 1 && b.messages.filter(entry => entry.message.type === "sound-left" && entry.message.sound.id === answerId).length === 1, "simultaneous duplicate HTTP delivery creates one source and one event per observer");
  b.close();
  b = await openStream(bo);
  check(b.snapshot.you.id === boId && JSON.stringify(b.snapshot.chorus) === JSON.stringify(canonical), "a disconnected friend returns to the current work and their original participant");

  await stop();
  const beforeRows = allRows();
  result.beforeRestartTableHash = rowHash(beforeRows);
  await start();
  a = await openStream(ada); alias = await openStream(ada); b = await openStream(bo);
  assert.deepEqual(a.snapshot.chorus, canonical); assert.deepEqual(b.snapshot.chorus, canonical);
  check(a.snapshot.sessionId === sessionId && a.snapshot.you.id === adaId && alias.snapshot.you.id === adaId && b.snapshot.you.id === boId, "actual SIGTERM and a new server process preserve the room and both cookie identities");
  assert.deepEqual(allRows(), beforeRows);
  check(true, "every durable table is byte-equivalent by row after startup; source authors, positions, timestamps and links are unchanged");
  const retry = await api(bo, sessionId, "sounds", "POST", request);
  check(retry.status === 200 && retry.replayed && retry.sound.id === answerId, "a committed retry after process restart reads its original acknowledgement without needing a new position");
  await move(ada, sessionId, 0, 0);
  const removedBegan = performance.now();
  const removed = await api(ada, sessionId, `sounds/${source.sound.id}`, "DELETE");
  assert.equal(removed.status, 200);
  const afterRemoval = await receivedTogether(a, b, message => message.type === "sound-removed" && message.id === source.sound.id, removedBegan);
  check(afterRemoval[0].id === source.sound.id && !afterRemoval[0].duet && afterRemoval[0].variant === "lantern" && afterRemoval[0].sources.length === 3 && afterRemoval[0].liveSources.length === 2, "removing the parent closes the duet, keeps the work identity and history, and changes both observers' live result");
  await stop();
  const removedRows = allRows();
  result.afterRemovalTableHash = rowHash(removedRows);
  await start();
  a = await openStream(ada); b = await openStream(bo);
  assert.deepEqual(a.snapshot.chorus, afterRemoval); assert.deepEqual(b.snapshot.chorus, afterRemoval);
  assert.deepEqual(allRows(), removedRows);
  const historicalParent = b.snapshot.chorus[0].sources.find(sound => sound.id === source.sound.id);
  check(!!historicalParent.removedAt && !b.snapshot.sounds.some(sound => sound.id === source.sound.id) && b.snapshot.sounds.find(sound => sound.id === answerId)?.replyTo?.removedAt === historicalParent.removedAt, "a second real restart preserves the removed parent's attribution and tombstone without reviving its sound");
  await move(bo, sessionId, 1.3, 0);
  const late = await api(bo, sessionId, "sounds", "POST", { ...request, operationId: "process-too-late-answer" });
  check(late.status === 409 && late.code === "reply_gone", "a fresh late reply cannot recreate a removed source or silently become an ordinary contribution");
  assert.deepEqual(allRows(), removedRows);
  const relations = await fetch(`${base}/api/sessions/${sessionId}/sounds/${source.sound.id}/replies`).then(response => response.json());
  check(relations.ok && !!relations.sound.removedAt && relations.replies.length === 2 && relations.replies.some(sound => sound.id === answerId && sound.byId === boId), "the historical conversation retains the real friend's source and removed parent after restart");
  check(new Set(result.pids).size === 3, "verification used three separate server PIDs and one continuously preserved scratch database");
  result.maxUpdateLatencyMs = Math.max(...result.updateLatenciesMs);
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await stop();
  if (out) {
    writeFileSync(join(out, "results.json"), JSON.stringify(result, null, 2) + "\n");
    writeFileSync(join(out, "server.log"), serverLog);
  }
  rmSync(scratch, { recursive: true, force: true });
}
