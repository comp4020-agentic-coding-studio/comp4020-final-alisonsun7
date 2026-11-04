# 06 — Claude 的推荐实现顺序

## Phase 0 — 仓库审计（在改代码前）
- 检查 `package.json`, `pnpm-lock.yaml` / yarn lock, README, PROCESS, research note, Docker/Fly manifests, DB, sockets, tests。
- `git status` 不得覆盖既有工作。
- 复用已上线的 SoundGarden 系统中的有效 websocket/db/Fly 能力；不要机械复制旧音乐网格的 UI。
- 建 `IMPLEMENTATION_PLAN.md`，给出具体变更文件和阻碍；继续动手。

## Phase 1 — 完整可玩垂直切片 P0（最高优先）
1. Marie Reay 主场景由**用户拍摄照片**提供精确布景信息。先重建 `IMG_8100.jpeg` 那个主镜头，三个金属电梯、木墙、高桌、垃圾桶、部分楼梯可见。
2. 简洁的操作层：声音托盘 + hotspot + gain；初始化为无用户添加声音。
3. 后端场景/session/placement CRUD 与 WebSocket broadcast；两浏览器同步。
4. Web Audio 播放示例（版权明确）+ 音频开启按钮。
5. Server 180s timer，结束保存，Archive 能打开同一结果。
6. 数据恢复/断线提示/基础自动化测试。

## Phase 2 — 真实 Marie Reay 精化
1. 镜头切换：电梯/阶梯/入口/茶水区；路径仅在照片支持的镜头间切换。
2. 用静态贴图+轻动画或自建简单 3D 角色模型，建立 4–6 个 NPC 行为：电梯等候、上下楼、用微波炉、使用水槽、高桌学习、阶梯休息。
3. 带位置的声音与触发；给每个动作具体锚点与 UI 提示。
4. 图像与实景逐张比对，修复明显位置/比例错配。

## Phase 3 — Chifley 三模式
- 依据公开的 **最新真实** Chifley / Joplin Lane 图片，只建一个共享步道背景。
- morning/weekday/rainy-dusk 切换真实可验证外观上的时间/天气效果，不臆造建筑设施。
- 与模式匹配的声源、人物密度、脚步/自行车/雨声、适当静态气氛。
- 如果缺足够外部视觉资源，只制作简洁且明确标注的「reference pending」示意场景，避免假还原。

## Phase 4 — LAB ANU
- 从 LAB 官网 gallery 获得可用照片并检查许可，重建被确认的入口及室内 1 个镜头。
- 从室外切换进入室内；室内外音响过渡；几种咖啡和谈话声源。
- 不做未经证实的深层平面或全店空间。

## Phase 5 — 打磨、验收与交付
- 两浏览器、弱网、重连、DB 重启、重新部署（若具备条件）
- 不只是运行 npm 测试，还拍实际双浏览器演示；声源保存后全新浏览器可查看。
- 390px/mobile、键盘、声音关闭、字幕/可视化声源信息。
- 完成 `README.md`、`PROCESS.md` 真实开发证据；研究短文若是作业必需则由用户本人完成核心思考，Claude 可辅助结构和校对。
- 输出 `IMPLEMENTATION_REPORT.md`：可重现的运行指令、测试、已完成和缺口、许可证、图片证据对应。

## 决策门槛
- 如果 3D 导致与照片差异过大或多人功能受阻，降级为精致 2.5D 多镜头热点。
- 如果无法获取 Chifley/LAB 图片许可，保留场景选项但不使用网络照片做未经授权的部署背景。
- 如果真实录音审核/上传不可控，P2 延期，用开源可商用/自录或 Web Audio 合成。
- 不要在 P0 未交付前追求高成本粒子、复杂 AI NPC、自由 3D 漫游。

## 开发完成度报告表
用表列出：功能 / 状态（完成、部分、未做）/ 证据路径 / 测试 / blocker，不能因为 UI 有入口就称功能完成。
