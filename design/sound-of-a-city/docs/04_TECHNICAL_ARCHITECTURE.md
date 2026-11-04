# 04 — 技术架构与运行约束

## 先审计、后选择
如果现有仓库是 React/Next/Express/Astro/Svelte + SQLite/Fly 等，优先在现有框架演进，不要因为文档提议而重建全栈。遵守现有测试与部署。以下是**参考架构**，不是强制依赖版本。

## 推荐逻辑模块
- `Web UI`: scene viewport, cinematic overlays, minimal HUD, sound tray, mode selector, memory view, accessibility.
- `Scene Engine`: photo-grounded layered/canvas/SVG or existing Three.js renderer; hotspot navigation; NPC animation state; event-driven weather.
- `Audio Engine`: Web Audio API, decoded buffer cache, GainNode, StereoPannerNode, limiter/compander, explicit unlock + lifecycle disposal.
- `Realtime Client`: socket connection, snapshot handshake, reconnection backoff, optimistic UI with pending/saved/error; no silent data loss.
- `Server`: authenticated-by-session anonymous `participantId` token, validation, server-side 180s clock, sequence/revision, event broadcast, access controls.
- `Persistence`: SQLite on existing persistent Fly volume (or current persistent DB), WAL where safe; migrations; backups, no localStorage-only source of truth.
- `Assets`: original/allowed generated scene textures, owned/CC-cleared audio, attribution manifest, fallback visuals.

## 实时同步流程
`client A click sound -> client sends sound.add(operationId, sessionId, anchorId, soundId, gain) -> server validates + DB transaction -> increments revision -> broadcasts committed event -> clients A/B apply revision -> audio engine schedules playback after user's unlock`。
Joining B: `session.join -> server sends scene snapshot + revision + serverNow + sessionStart`, then stream ordered events. A reconnect must reload latest snapshot or event sequence; no reliance on missed transient socket messages.

## 数据持久化要求
- Scene/mode/session/sound-placement/memory/event 在后端保存。
- 每个声源的音频文件是可归属的素材 ID；不可保存本机绝对文件路径。
- fly volume 持久化单机约束：若课程要求单实例，应遵守；SQLite 不能随意扩展多个无共享存储 writer 的实例。
- 时间统一存 UTC，前端显示地点/本地时间标签；三分钟 session 用 serverNow 作基准。
- process restart / redeploy after volume preserved 不丢记录；**重部署验证要真实执行才能声称通过**。

## 安全和验证
- 客户端输入校验不替代服务端校验。soundId、anchorId、sessionId、gain、位置范围、nickname 长度必须服务端检验。
- session owner/participant scope、操作去重、速率限制；文件上传仅在完善配额/审核后开放。
- 不要接受任意远端 URL 作为音频源，避免恶意请求或侵犯版权。
- 所有原始开发参考照片单独存于 design/reference，不公开托管（除非获明确授权）。

## 性能预算（开发目标，须实测）
- 正常笔记本 1366x768、60fps 为理想，P0 可以 30fps 以上稳定；极弱设备自动降低 NPC 及雨粒子密度。
- 两浏览器同局域/正常网络声源事件通常 <= 1 秒可见，记录 10 次测量的中位数/最大值；这是目标不是已达成事实。
- 初次场景资源尽可能 <= 5MB **压缩后关键加载资产**（目标，不能因设计掩盖真实数据）。
- 声源同时播放软限制，例如最多 12 声源、声音限幅；精确数目可实测调整。
- 动效尊重 `prefers-reduced-motion`。

## 失败恢复
- Socket 断线：状态为 `Disconnected · changes not sent`，禁止假保存；重连获取权威状态，可重试待提交操作。
- DB 写失败：显著失败状态、提供重试。未写成功不可更新 Archive。
- Audio decode fail：素材标记不可用，UI 提示但世界可继续操作。
- 无 AudioContext 权限：纯视觉体验可用，提示点击开启声音。
- Session 结束时：前端与服务端处理重复 finish 幂等。

## 测试便利性
设计确定性 fixture：`scene.mar ie`（实际 ID 用 `marie-reay-ground`）、`memory-demo`, `test-audio-sine`，使无版权音频也能跑完自动化测试。分离纯状态 reducer/验证函数与实际音频节点便于单测。
