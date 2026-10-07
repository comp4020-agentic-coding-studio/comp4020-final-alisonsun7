# C10 minimal logging specification

Goal: watch a live terminal log and explain what people are doing without using the product UI yourself. A dashboard is optional. C10 expects server-side structured action logs with who/what/when; eliminating all actor information does not meet this intent.

## One line, one observable outcome

Emit compact JSON to stdout after committed actions. Common fields:
- timestamp: ISO UTC;
- event: controlled event name;
- actor: opaque stable room-scoped participant pseudonym, never an access credential;
- room: non-secret internal room identifier;
- phase and round/attempt identifiers when relevant;
- outcome: committed/rejected/idempotent_replay;
- revision: durable room state revision when available;
- requestId: non-credential request correlation value;
- reason: controlled code for rejection, not a raw request dump.

Illustrative schema only (NOT a real observation):
```json
{"timestamp":"2026-10-21T00:00:00.000Z","event":"proposal.created","actor":"actor_opaque","room":"room_opaque","phase":"planning","outcome":"committed","revision":12}
```

Generate actor independently or from an appropriate room-scoped identifier; never truncate a secret/token hash into a log identity. Support repeated actions by the same actor so the observer can distinguish one member acting twice from two members acting once. A room code may be an invitation, so prefer internal room IDs.

## Events

Room create/join/restore/start; role reveal if the server actually receives that action; proposal create; support set; voting opened; vote created/changed; round closed; revote opened; tie drawn; plan completed; stream connected/disconnected; mutation rejected. Include relevant read/entry events only when they help narrate usage, not every heartbeat/static asset as a user action. Server cannot observe a click that never reaches it.

Log an idempotent retry distinctly instead of claiming another successful new action. Server state revision and outcome allow interpretation. On a rollback, no committed-success line. Record rejection when a vote arrives after closure. Avoid response data that couples actor with vote option. Logging a vote.changed action is enough to narrate activity without disclosing the preference.

## Privacy and access

No nickname, proposal title, vote candidate, cookie, credential hash, token, request body, user-agent or IP by default. Do not log arbitrary error objects that contain headers/SQL payloads. Raw logs are for operator access via the configured Fly tools; don't expose a public /admin endpoint. If a stats page is later justified, use aggregates and appropriate access controls, not raw personal event feeds.

The database contains the plan; stdout logs are diagnostic records with provider retention. Do not promise forever log history. Read actual provider behaviour before claiming retention or access. Bounded connections and JSON serialization keep overhead small. A separate event DB/dashboard is not required.

## Demonstration

Confirm actual app identifier and auth environment, then use the installed tool equivalent of:
```bash
mise exec -- flyctl logs -a comp4020-final-alisonsun7
```

Classmates create/join/add/vote in the deployed app. Wen watches the log tail only and narrates separate actors, stage changes, attempts, errors and completion. Do not operate your own UI during the instruments-only demonstration. Never pre-write fake event lines to make the demo look busy.

## Verification

Capture actual emitted lines in isolated tests; assert fields, no sensitive fixtures, one success per committed intention, explicit retry/rejection and coherent phase/revision. In deployed smoke use two consenting test actors and narrate actual lines. A stream connect is not proof someone is reading; avoid over-interpreting.
