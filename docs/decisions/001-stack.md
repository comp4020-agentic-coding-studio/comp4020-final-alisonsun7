# ADR 001 — one server and durable SQLite

Status: proposed; replace with accepted/superseded only after inspecting the actual starter and making the choice. Record date, real implementation paths, dependencies and commit when accepted.

## Context

C8 needs a working contribution/return loop quickly. The product is a small bounded group, and the course supplies a Fly app with a machine and persistent volume. Browser-only storage cannot carry the shared board. We need a stack that preserves the course check/deploy path and leaves room for later real-time updates.

## Options

1. Continue the existing template's viable runtime, adding a small server and SQLite where necessary.
2. Small Node/TypeScript server, server-rendered HTML and minimal browser JavaScript, SQLite on the supplied volume.
3. A full SPA plus a separate API and externally hosted relational database.

## Proposed choice

Prefer option 1 if it already meets the requirements with maintained dependencies. Otherwise option 2 is a reasonable default for Wen's JavaScript/TypeScript workflow. A single request-to-database path is easier to inspect and fits C8; server rendering makes the full README available in returned HTML. Confirm exact library versions and supported runtime from primary documentation before locking them. Do not automatically force React, Astro or a new ORM.

## Costs and constraints

A single SQLite writer and machine limit scaling and high availability. Later SSE is feasible on one server, but not implemented yet. DB file, WAL and shared-memory files must stay under the actual persistent mount. Native database modules, if used, must build for the Docker runtime rather than rely on a developer Mac binary. Migrations must preserve earlier ideas; no table-drop shortcut.

## Evidence needed before acceptance

- Actual starter constraints and why the chosen option fits.
- Build/test/deploy results on the selected runtime.
- Path and configuration proving production uses the volume.
- A recorded restart/redeploy readback and remaining limits.
- Real implementation commit link.

ADR format reference: Michael Nygard, [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Its value here is keeping options and consequences visible; the proposed technical choice is our project judgement.
