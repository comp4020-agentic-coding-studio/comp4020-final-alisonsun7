# Local development on macOS

Run commands from the repository root. Install dependencies on this Mac rather
than carrying `node_modules` across machines or unpacking it from an archive.
The project pins **Node 24.21.0 and pnpm 11.9.0** in `mise.toml`.

## Setup and start

With [mise](https://mise.jdx.dev/cli/exec.html) installed:

```sh
mise install
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install --frozen-lockfile --registry=https://registry.npmjs.org/
mise exec -- pnpm dev
```

The app opens at `http://localhost:8080`. Its local SQLite database is
`.data/sound-of-a-city.db`; restarting does not clear it. Dependencies use the
project's ignored `.cache/pnpm-store`, configured in `pnpm-workspace.yaml`.
Keep that configuration and the workspace's esbuild build permission intact.

## Repair copied dependencies

An Apple warning about `fsevents.node`, or a test runner hanging during native
module loading, can follow a copied dependency tree carrying archive quarantine
metadata. [fsevents](https://github.com/fsevents/fsevents) is a macOS filesystem
watcher used by the development tools. This lockfile needs both versions 2.3.2
and 2.3.3; replacing them with one version is not a repair.

Stop this project's servers and test processes first. The following preserves
the old dependency tree and store, then downloads the locked packages into a
fresh project store. It leaves source files, the lockfile, GitHub identity and
the database untouched.

```sh
(
  set -eu
  soac_backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/soac-dependency-backup.XXXXXX")"
  printf 'Dependency backup: %s\n' "$soac_backup_dir"
  if [ -e node_modules ] || [ -L node_modules ]; then
    mv node_modules "$soac_backup_dir/node_modules"
  fi
  if [ -e .cache/pnpm-store ] || [ -L .cache/pnpm-store ]; then
    mv .cache/pnpm-store "$soac_backup_dir/pnpm-store"
  fi
  mise exec -- pnpm install --frozen-lockfile --registry=https://registry.npmjs.org/
  mise exec -- pnpm typecheck
  mise exec -- pnpm build
)
```

Keep the printed backup directory until verification succeeds. If installation
fails, it remains available for inspection; do not delete `.data` or relax macOS
security settings. This procedure does not remove quarantine attributes or
disable Gatekeeper. [pnpm's frozen install](https://pnpm.io/cli/install) preserves
locked versions and checks package integrity; once the fresh store is populated,
`mise exec -- pnpm install --offline --frozen-lockfile` can reuse it.

Verify genuine imports without the earlier temporary test workarounds:

```sh
mise exec -- env -u NODE_OPTIONS -u NAPI_RS_NATIVE_LIBRARY_PATH \
  node --input-type=module -e 'await import("playwright"); await import("vitest/node"); console.log("Native imports OK")'
```

Run HTTP tests against a running local app selected by `APP_URL`. Browser tests
need Chrome and a scratch database; see `CLAUDE.md` for the checks. Do not use
the production database for tests.

## Corepack alternative

If Node **24.21.0** is already selected and Corepack is available, its
[version-specific command](https://github.com/nodejs/corepack#utility-commands)
can install and run individual tasks without global activation:

```sh
COREPACK_ENABLE_AUTO_PIN=0 corepack pnpm@11.9.0 install --frozen-lockfile --registry=https://registry.npmjs.org/
COREPACK_ENABLE_AUTO_PIN=0 corepack pnpm@11.9.0 build
COREPACK_ENABLE_AUTO_PIN=0 corepack pnpm@11.9.0 start
```

Use mise for `dev` and `check`, whose scripts invoke bare `pnpm` internally;
with Corepack, run `build`/`start` and `typecheck`/`test` individually instead.
No `corepack enable`, global pnpm activation or dependency upgrade is needed.

## Keep a tool-started preview running

A foreground development command depends on its terminal or tool session. A
preview that must survive that session should launch Node directly in a detached
process, with stdin ignored and stdout/stderr appended to `.cache/preview.log`.
For a Node launcher, use `spawn` with `detached: true`, those independent stdio
handles, and `child.unref()` ([Node documentation](https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html#optionsdetached)).

Keep the same working directory, explicit `PORT` and existing `DB_PATH`; do not
fall back to a new empty database when restoring a preview. Record its PID,
port, database and log path in ignored `.cache/preview.json`. After the launcher
exits, independently check the listening port and an HTTP response. Verify that
the recorded PID still owns the expected listener before stopping it; PIDs can
be reused. This is a local preview, not an operating-system startup service.
