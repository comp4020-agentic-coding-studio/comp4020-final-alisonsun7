# 05 — 推荐数据模型、API 与事件定义

以下为契约建议。现有库/路由可调整命名，但**语义和验证要求**应保留。

## SQLite tables
```sql
CREATE TABLE scenes (id TEXT PRIMARY KEY, title TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, scene_id TEXT NOT NULL REFERENCES scenes(id), mode TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('idle','active','ending','saved','failed')),
 started_at TEXT, duration_ms INTEGER NOT NULL DEFAULT 180000,
 revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE participants (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 display_name TEXT NOT NULL, avatar_id TEXT NOT NULL, joined_at TEXT NOT NULL
);
CREATE TABLE sound_assets (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, category TEXT NOT NULL,
 file_path TEXT, duration_ms INTEGER, looping INTEGER NOT NULL DEFAULT 0,
 license_name TEXT NOT NULL, attribution TEXT, publication_allowed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE placements (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 owner_id TEXT NOT NULL REFERENCES participants(id), sound_id TEXT NOT NULL REFERENCES sound_assets(id),
 anchor_id TEXT NOT NULL, x REAL NOT NULL CHECK(x BETWEEN 0 AND 1),
 y REAL NOT NULL CHECK(y BETWEEN 0 AND 1), gain REAL NOT NULL CHECK(gain BETWEEN 0 AND 1),
 pan REAL NOT NULL CHECK(pan BETWEEN -1 AND 1), is_deleted INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE session_events (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 participant_id TEXT, event_type TEXT NOT NULL, operation_id TEXT NOT NULL,
 payload_json TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, server_seq INTEGER NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(session_id, operation_id), UNIQUE(session_id, server_seq)
);
CREATE TABLE memories (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
 title TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
 saved_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
);
```
实际数据库须迁移保护、索引/外键、避免过度存储个人信息。若同一参与者跨多个 session，ID 管理按现有系统合理设计。

## HTTP
`GET /api/scenes` 获取可选 scene 和 modes
`POST /api/sessions` body `{sceneId,mode,nickname,avatarId}` 返回 sessionId, participantId, token, expiresAt
`GET /api/sessions/:id` 返回 snapshot（非私密用户数据）
`GET /api/sessions/:id/events?sinceSeq=...` 用于 socket 不可用时可选补偿
`GET /api/memories/:id` 返回已授权可访问的回放快照
`GET /api/memories` 列出公开 memory，必须过滤 privacy
`POST /api/sessions/:id/finish` 幂等结束（服务端拥有 timer）

## WebSocket events
`session.join`: `{ sessionId, token, lastSeenSeq? }`
`session.snapshot`: `{ sessionId, status, serverNow, startedAt, durationMs, revision, placements, participants }`
`sound.add`: `{ operationId, soundId, anchorId, x, y, gain, pan }`
`sound.update`: `{ operationId, placementId, baseRevision, gain?, x?, y?, pan? }`
`sound.remove`: `{ operationId, placementId, baseRevision }`
`session.start`: `{ operationId }`
`session.finish`: `{ operationId }`
`presence.update`: `{ users:[{id,name,avatarId}] }`
`server.committed`: `{ serverSeq, revision, operationId, type, payload, serverAt }`
`server.rejected`: `{ operationId, code, message, serverRevision? }`

## 规则
- 服务器校验模式必须属于场景、anchor 必须存在、声音类别与空间兼容。
- `operationId` 由客户端生成，DB unique 幂等。
- 其他用户不能随意删除一个声源作者自己的贡献；owner 检查放服务端。
- `memory` 的公开与否按音频版权及用户授权限制。
- 所有事件按提交顺序处理；客户端发现序列缺失直接请求 snapshot。
- 服务器比较 `baseRevision`，冲突时返回明确 error 并刷新。

## 配置示例
```json
{
  "sceneId": "marie-reay-ground",
  "mode": "daytime",
  "shotId": "main-lift-wall",
  "imageEvidence": ["IMG_8100.jpeg", "IMG_8113.jpeg"],
  "anchors": [
    {"id":"elevators","label":"Elevators","allowedSounds":["lift-ding","footsteps","quiet-talk"]},
    {"id":"stair-steps","label":"Orange staircase","allowedSounds":["footsteps"]},
    {"id":"tables","label":"High tables","allowedSounds":["typing","quiet-talk"]},
    {"id":"microwave","label":"Microwaves","allowedSounds":["microwave-beep","microwave-hum"]},
    {"id":"sink","label":"Sink","allowedSounds":["running-water"]}
  ]
}
```
此 JSON 不提供精确坐标；应根据用户照片经可视化标注后录入。
