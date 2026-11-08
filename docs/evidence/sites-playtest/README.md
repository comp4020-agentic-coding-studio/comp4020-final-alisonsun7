# Sites playtest publication evidence

The [index](../sites-playtest-2026-11-08.json) records hashes and scopes.
The [decision](../../decisions/038-sites-playtest-publication.md) explains why
the existing Node backend is retained behind a streaming Worker.

- `release.json`: actual version IDs, immutable backend image and rollback image.
- `fly-before-databases.json` and `fly-after-databases.json`: counts and logical
  hashes only, without database files or private row content.
- `fly-after-machine.json`: the unchanged single-machine/volume configuration.
- `results.json` and PNGs: 29 actual public desktop/phone checks, two independent
  anonymous observers, zero write attempts. Not a two-player creation study.
- `frog-public-delivery.json`: native Chrome verifies the real public audio bytes;
  it does not play them or establish listening quality.
- `gateway/`: exact published Worker and its sixteen isolated controls. Replay
  from the project root with `node --test docs/evidence/sites-playtest/gateway/spec/proxy.test.mjs`.
- `isolated-proxy-backend.json`: nine real Node/SQLite integration checks. Every
  transport request maps only to guarded loopback 18954, never a public write.
- `compiled-verification.json`: all 74 JS modules match the released source.
- `verify-public.mjs` and `verify-proxy-backend.mjs`: exact runner snapshots from
  `.cache/sites-playtest/`. The latter was run under its `integration/` subfolder;
  its workspace and safety guards deliberately prevent running the archived
  copy from a different location. Do not remove those guards to run online tests.

No actual cookie tokens, access credentials or database files are included.
The human two-pair study, actual speaker listening and next-day return remain
unperformed. A successful native Site publication is not evidence for them.
