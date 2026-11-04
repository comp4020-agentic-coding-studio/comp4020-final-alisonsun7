# 10 — 资产获取、证据审计与制作流程

## 总原则
真实参考不等于可直接发布的素材。要分别管理：`reference`（仅内部确认真实物件）、`public artwork`（有权公开发布）、`sound asset`（有权在线播放）。

## 已打包的用户照片
`references/marie-reay/IMG_*.jpeg` 六张。任何描述请以用户实拍为准，不从文件 EXIF 猜地理位置。 `CONTACT_SHEET.jpg` 只是索引。

## Claude 的使用步骤
1. 阅读 `references/IMAGE_EVIDENCE.md`，逐张检查所指对象。
2. 写 `assets-manifest.json`：`id,path,license,status,referenceEvidence,sceneId,shotId,creator,publicAllowed`。
3. 对每个场景构造 `shot` 列表，先照片角度绑定，再标注热点；不要直接由多张透视图生成编造坐标。
4. 若需要视觉素材生成或插画转绘，必须使用有权限的工具和来源；保持建筑准确，角色轻写实，不能让原片中的学生被当成真实人物复制。
5. 所有替代未确认素材必须在开发报告写 `PLACEHOLDER`。
6. 定期检查版权：用户拍摄照片是否获公开部署授权、第三方照片的许可、背景音乐/环境声音的使用权。

## 仍缺证据的具体清单
- Chifley 小路从哪一侧看、入口与桥的准确当前状态、路面/树木/遮蔽位置；需要更新实拍或明确可改编的来源。
- LAB ANU 完整立面与实际内部摄影中可确认的吧台、门、座位角度；店铺网站的画廊可能混有菜品照片，不是每一张都可作建筑参考。
- Marie Reay 用户照片之间的相机走位或实际尺寸；要连续可漫游 3D 需补齐实拍或测绘。
- 法律可公开播放的各类日常音效；在没有许可前用自合成/用户原创短样音。

## 建议素材清单（目标，不表示已有）
Chifley: 1 x real-grounded base scene, 3 x grade/weather overlays, 5–8 NPC motions, 6 sound types.
LAB: 1 x entrance, 1 x indoor reference-supported shot, 4 NPC motions, 7 sound types.
Marie: 4 x photo-grounded shots, 6–8 NPC motions, 8 sound types.
UI: place cursor, mute state, draggable sound badge, online avatars, replay timeline, loading and failure states.

## 不要直接搜索并下载 100 张图打包
大量公开图片可能侵权、过时或与场景不符。以场景确实需要的可用证据为优先；网页仅提供来源和参考链接，不把搜索结果批量挪进 ZIP。
