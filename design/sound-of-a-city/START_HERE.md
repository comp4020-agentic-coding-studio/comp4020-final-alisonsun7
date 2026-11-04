# Sound of a City — ANU Edition | Claude Code 开发启动包

版本：1.0（2026-11-05）｜语言：产品和技术说明中文，代码/变量/提交用英文。

## 项目一句话
一座校园不只是建筑，而是由每天在其中生活的人和他们的平凡声音共同赋予生命。玩家在真实 ANU 场景里，以克制写实的拟人猫狗化身探索、添加生活声源、共同塑造三分钟声音记忆。

## 怎么使用本压缩包
1. 将整个解压后的目录放到现有 COMP4020 Final Project 代码仓库根目录下，例如 `design/sound-of-a-city/`，**不要**覆盖已有 `README.md`、`PROCESS.md`、`research-note.md` 或代码。
2. 将本文件夹的 `CLAUDE.md` 内容提供给 Claude Code，或在 Claude Code 里说：`Read design/sound-of-a-city/CLAUDE.md and execute the project workflow. Use this folder as the authoritative design brief. Inspect the existing repository before modifying any code.`
3. Claude 应先审计现有项目，保留可用的实时同步、SQLite、Fly.io、测试与研究证据；再按文档的实施顺序编码、运行、测试、部署（仅在已有有效授权时）。
4. 附件中的六张 Marie Reay 现场照片在 `references/marie-reay/`；查看 `references/IMAGE_EVIDENCE.md`。若不可直接在代码执行上下文查看图片，应使用本地图片查看工具或请用户提供可看形式，不得猜测。
5. 如果实际代码、服务或外部资产访问受限，Claude 应完成可完成的部分并写 `IMPLEMENTATION_REPORT.md`，不得谎称已部署或测试通过。

## 文档目录（推荐阅读顺序）
- `CLAUDE.md`：给开发 Agent 的首要执行指令
- `docs/01_PRODUCT_REQUIREMENTS.md`：完整产品目标、范围与用户流程
- `docs/02_SCENE_AND_VISUAL_SPEC.md`：场景、镜头、NPC、视觉风格
- `docs/03_INTERACTION_AND_AUDIO.md`：声音交互、三分钟流程、录音与回放
- `docs/04_TECHNICAL_ARCHITECTURE.md`：前后端、SQLite、实时事件、素材、恢复
- `docs/05_DATA_MODEL_AND_API.md`：推荐数据结构、API、事件契约
- `docs/06_IMPLEMENTATION_PLAN.md`：分阶段开发和决策门槛
- `docs/07_TEST_AND_ACCEPTANCE.md`：逐项可执行验收与手工场景
- `docs/08_ACCESSIBILITY_PERFORMANCE_PRIVACY.md`：无障碍、性能、隐私、版权
- `docs/09_UI_CONTENT_AND_COPY.md`：文案、页面结构、状态与空场景
- `docs/10_ASSET_PIPELINE.md`：照片参考、建模、声音素材的证据治理
- `references/IMAGE_EVIDENCE.md`：6 张用户照片索引及可信事实
- `references/EXTERNAL_SOURCES.md`：公共网页来源（链接，不打包外部摄影作品）
- `checklists/RELEASE_CHECKLIST.md`：最终验收清单
- `templates/IMPLEMENTATION_REPORT_TEMPLATE.md`：Agent 交付报告模板

## 三个必须坚持的边界
1. **实景真实性**：任何建筑、设施、家具及其方位必须来自用户现场照片/许可图像/可核验资料；画面看不到就不能猜。用户照片只覆盖 Marie Reay 的局部区域，不能推导完整 floor plan。
2. **多人价值**：线上共同改变声音和氛围，双方可见、可听、可共同保存；不只做一个带多人光标的静态展示页。
3. **诚实交付**：可见演示、基础测试与后端持久化优先，不能用静态 mock 冒充真正的多人系统。

## 必须立刻做出的范围决定
当前离课程截止可能很近。默认采用**可运行的高保真 2.5D** 而不是盲目承诺完整自由移动的 3D 数字孪生。若仓库已有稳定的 Three.js/3D 运行基础，可保留；若没有，优先使用真实空间的分层场景、热点行走/入口转换和基于屏幕位置的空间声像，确保先交付完整体验。不得为了 3D 无限延期。
