#!/usr/bin/env python3
"""Start/switch the local preview without ever restoring a historical DB.

Uses ignored .cache/preview.json, or explicit --database for a first start.
--dist installs an already built candidate; --restart is explicit downtime.
Every existing persistent row must match across a switch. No network publish.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, signal, sqlite3, subprocess
import tempfile, time, urllib.request

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--database", type=Path)
parser.add_argument("--port", type=int, default=18861)
parser.add_argument("--dist", type=Path)
parser.add_argument("--commit")
parser.add_argument("--restart", action="store_true")
parser.add_argument("--rollback", action="store_true", help="Switch to the previous compiled app, keeping the current DB")
args = parser.parse_args()
metadata = root / ".cache/preview.json"
meta = json.loads(metadata.read_text()) if metadata.exists() else {}
previous_commit = meta.get("applicationCommit")
if args.rollback:
    if args.dist: raise SystemExit("Choose --rollback or --dist, not both.")
    previous = json.loads((root / ".cache/chorus-garden-promotion.json").read_text())
    if not previous.get("previousDist"): raise SystemExit("No previous compiled application is recorded.")
    args.dist = Path(previous["previousDist"])
    args.commit = previous["previousCommit"]
    args.restart = True
database = (args.database or Path(meta.get("database", ""))).resolve()
if not database.is_file():
    raise SystemExit("An existing database is required. Pass --database explicitly; no database is created or restored.")
if not 1024 <= args.port <= 65535:
    raise SystemExit("Choose an unprivileged local preview port.")
if meta and (meta.get("port") != args.port or str(database) != meta.get("database")):
    raise SystemExit("This checkout already records another port/database. Use an isolated checkout for scratch previews; the current history was not changed.")

def snapshot():
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        if db.execute("SELECT count(*) FROM placed_sounds WHERE while_in IS NOT NULL AND removed_at IS NULL").fetchone()[0]:
            raise RuntimeError("A private stay is active. Leave the room before switching application versions.")
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        return {table: sorted(json.dumps(row, ensure_ascii=False, default=lambda value: {"blob": value.hex()})
                              for row in db.execute('SELECT * FROM "' + table + '"')) for table in tables}

def listener():
    result = subprocess.run(["lsof", "-tiTCP:" + str(args.port), "-sTCP:LISTEN"], capture_output=True, text=True)
    return result.stdout.strip()

running = listener()
if running and not args.restart:
    print(f"Preview is already listening: http://localhost:{args.port}/planet. Use --restart for an intentional switch.")
    raise SystemExit(0)
if running:
    if running != str(meta.get("pid")) or meta.get("port") != args.port or str(database) != meta.get("database"):
        raise SystemExit("The listener does not match the recorded preview. No process stopped.")
    command = subprocess.check_output(["ps", "-p", running, "-o", "command="], text=True)
    if str(root / "dist/server.js") not in command:
        raise SystemExit("The listener command does not match this preview. No process stopped.")

candidate = args.dist.resolve() if args.dist else root / "dist"
if not (candidate / "server.js").is_file():
    raise SystemExit("Build the candidate first: pnpm build, or pass --dist to a compiled directory.")
commit = args.commit or (meta.get("applicationCommit") if not args.dist else None) or subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
subprocess.run(["git", "cat-file", "-e", commit + "^{commit}"], cwd=root, check=True)
cache = root / ".cache"; cache.mkdir(exist_ok=True)
staging = Path(tempfile.mkdtemp(prefix="preview-switch-", dir=cache))
if args.dist:
    shutil.copytree(candidate, staging / "new-dist")
before = snapshot()
old_stopped = False
children = []
log = Path(meta.get("log", str(cache / "preview.log")))

def stop(pid):
    child = next((p for p in children if p.pid == pid), None)
    if child and child.poll() is not None: return
    try: os.kill(pid, signal.SIGTERM)
    except ProcessLookupError: return
    if child:
        child.wait(timeout=8); return
    for _ in range(80):
        try: os.kill(pid, 0); time.sleep(.1)
        except ProcessLookupError: return
    raise RuntimeError("The recorded process did not exit; application files unchanged.")

def start():
    env = os.environ.copy(); env.update(PORT=str(args.port), DB_PATH=str(database))
    node = shutil.which("node")
    if not node: raise RuntimeError("Node24 is required.")
    with log.open("ab") as output:
        process = subprocess.Popen([node, str(root / "dist/server.js")], cwd=root, env=env,
                                   stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                   start_new_session=True, close_fds=True)
    children.append(process)
    for _ in range(80):
        if process.poll() is not None: raise RuntimeError("Preview stopped during startup; see " + str(log))
        try:
            with urllib.request.urlopen(f"http://localhost:{args.port}/planet", timeout=1) as response:
                if response.status == 200 and listener() == str(process.pid) and process.poll() is None: return process
        except Exception: time.sleep(.1)
    raise RuntimeError("Preview did not become healthy.")

try:
    if running:
        stop(int(running)); old_stopped = True
    # A fresh stable snapshot follows stopping, so no accepted current action
    # can fall between the comparison and switch. Backup is evidence only.
    before = snapshot()
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as source, sqlite3.connect(staging / "before.db") as backup:
        source.backup(backup)
    if args.dist:
        if (root / "dist").exists(): (root / "dist").rename(staging / "old-dist")
        (staging / "new-dist").rename(root / "dist")
    process = start()
    after = snapshot()
    if before != after: raise RuntimeError("Persistent rows changed; reverting application files while retaining the current DB.")
    served = {}
    for route in re.findall(r'^\s*"(/(?:client|shared)/[^"\n]+)":', (root / "dist/server.js").read_text(), re.M):
        expected = (root / "dist" / route.lstrip("/")).read_bytes()
        with urllib.request.urlopen(f"http://localhost:{args.port}" + route, timeout=5) as response:
            if response.read() != expected or response.headers.get("Cache-Control") != "no-cache":
                raise RuntimeError("Served bytes/cache mismatch: " + route)
        served[route] = hashlib.sha256(expected).hexdigest()
    for route in ["/planet", "/scene/seaside?mode=weekday", "/readme/"]:
        with urllib.request.urlopen(f"http://localhost:{args.port}" + route, timeout=5) as response:
            if response.status != 200: raise RuntimeError("Page failed: " + route)
    if listener() != str(process.pid) or process.poll() is not None:
        raise RuntimeError("The verified listener is not the spawned preview process.")
except Exception:
    if children: stop(children[-1].pid)
    if (staging / "old-dist").exists():
        if (root / "dist").exists(): (root / "dist").rename(staging / "failed-dist")
        (staging / "old-dist").rename(root / "dist")
    if old_stopped:
        process = start(); meta["pid"] = process.pid; metadata.write_text(json.dumps(meta, indent=2) + "\n")
    raise

meta.update(pid=process.pid, port=args.port, database=str(database), log=str(log), applicationCommit=commit)
metadata.write_text(json.dumps(meta, indent=2) + "\n")
digest = lambda rows: hashlib.sha256("\n".join(rows).encode()).hexdigest()
release_record = cache / "chorus-garden-promotion.json"
# Restarting the same compiled app must not discard the preceding version.
# Only an actual file switch replaces the rollback target.
prior_release = json.loads(release_record.read_text()) if release_record.exists() else {}
rollback_dist = str(staging / "old-dist") if args.dist else prior_release.get("previousDist")
rollback_commit = previous_commit if args.dist else prior_release.get("previousCommit")
record = {"applicationCommit": commit, "pid": process.pid, "port": args.port,
          "previousCommit": rollback_commit,
          "database": str(database), "allRowsPreserved": True,
          "tables": {name: {"rows": len(rows), "sha256": digest(rows)} for name, rows in after.items()},
          "served": served, "previousDist": rollback_dist,
          "backupIsNotForVisualRollback": str(staging / "before.db")}
release_record.write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"url": f"http://localhost:{args.port}/planet", "pid": process.pid,
                  "allRowsPreserved": True, "verifiedAssets": len(served),
                  "record": str(cache / "chorus-garden-promotion.json")}, indent=2))
