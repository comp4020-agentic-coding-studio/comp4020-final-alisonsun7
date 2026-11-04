# 07 — 验收测试计划

## P0 强制通关（没有完成应在交付报告显著列出）
- [ ] 打开网站不需要账号即可看到地点、如何进入以及第一个可完成动作。
- [ ] 可进入 Marie Reay 场景并识别真实照片中的三个电梯/木墙/楼梯或茶水区至少一组准确场景。
- [ ] 不选择音频前没有**用户添加**的音轨在播；点击 Enable Sound 后声音才开启。
- [ ] 音效能放到允许的空间锚点，调整音量、删除后实际听到差异。
- [ ] 两个独立浏览器 A/B 同 session：A 增加声源后 B 可见、可听；B 增加后 A 同样可见。
- [ ] 重复发送同一 operationId 不产生重复声源；越权删除被服务端拒绝。
- [ ] 180 秒的进度由服务器控制，两个浏览器显示接近一致；不会因页面刷新重启计时。
- [ ] Save 后新浏览器可打开已保存 Memory 并正确显示贡献与声音配置。
- [ ] 重启 server/database 进程，Memory 和 scene 状态仍能读取。
- [ ] 数据库写失败不能显示“Saved”成功提示。
- [ ] Socket 丢失清楚提示，重连后取得 server snapshot，不会重复播放所有历史 add 事件。
- [ ] Chifley 三个模式都有明显时段/天气差别；不能只有三个文本标签。
- [ ] 390px 手机宽度能够添加/移除声音，不强制 drag-and-drop。
- [ ] 键盘可使用场景切换与声源主要操作，焦点清楚，声音具有文字标签。
- [ ] 引用的摄影和音效都有权属/许可记录；未知来源不打包到公开站点。

## 双浏览器并发手工脚本
1. Chrome 普通窗口 A 与无痕 B，输入不同昵称，加入同 session。
2. A 在电梯锚点添加 `lift-ding`；在 B 的列表及空间位置出现，并且开启声音后听到。
3. B 在高桌添加 `typing`；A/B 状态一致；A 不能删除 B 的声源（如果设计 owner-only）。
4. 同时修改不同声源 gain；刷新 A，重连状态一致。
5. B 断网 → A 继续添加 → B 恢复；B 加载 snapshot，落盘状态保持。
6. session 开始计时，验证两端一致；结束后 A/B 都能访问 Memory。
7. 杀进程、重启，重新打开 Memory；若执行了 Fly redeploy，记录卷持久化证据。
8. 重放请求 operationId，确认唯一行不增加。

## 视觉准确性 QA
- 对比 `IMG_8100.jpeg`：电梯门数量、墙面与电梯排列、高桌和垃圾桶相对位置（只按可见同视角）。
- 对比 `IMG_8106.jpeg`：橙色楼梯和木质阶梯座位分处不同侧、坐垫位置类别、木质扶手和侧壁。
- 对比 `IMG_8101.jpeg`：水槽在柜体左侧，四台可见微波炉（上排两台、下排两台），深灰柜体；用户说明垃圾桶对面是设施区。
- 对比 `IMG_8098.jpeg`：长通道、玻璃边界、台面与地面条纹门垫。
- 不能用 2D 照片证明未出镜的 3D 距离；不应展示虚假的精确平面图。

## 自动化测试建议
- reducer tests: add/update/remove, unsupported hotspot, gain clamp, revision, op dedupe.
- DB integration: transaction rollback, unique op, restart persistence, public memory filter.
- socket integration: join snapshot, broadcast, stale revision, reconnect, timer finish idempotency.
- e2e: enter scene, enable audio, add sound, second context sees it, finish & memory.
- a11y: keyboard tab order, focus, aria live for sync status, prefers-reduced-motion.

## 完成定义
每条测试有：执行命令/步骤、实际结果、日期、日志或截图位置。未执行必须写 `NOT RUN`，失败必须写 `FAIL`，不得写 `PASS`。
