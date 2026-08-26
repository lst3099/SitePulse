# SitePulse — Context Repository

SitePulse 是面向施工现场的人员、项目、海康人脸门禁考勤与工器具管理平台。

## 目录结构

| 目录 | 用途 |
| --- | --- |
| `context/` | 已确认的产品事实、术语、架构和业务规则 |
| `workspace/` | 当前实现、活动方案、会议结论与原始参考资料索引 |
| `drafts/` | 尚未定稿的需求、决策和待确认事项 |
| `src/` | React/Vite 应用源码与测试 |

## 文档生命周期

- 文档按 `drafts/ → workspace/ → context/` 演进。
- `context/` 表示当前可作为事实使用的内容；`workspace/` 表示正在实施或仍需持续维护的内容；`drafts/` 表示未定稿内容。
- 新增或移动文档后，必须同步更新对应目录的 `CLAUDE.md`。
- 原始方案、二进制附件和本地资料集中在 `workspace/source-materials/`，该目录默认不上传 GitHub。

## 导航入口

- [context/](context/CLAUDE.md)：产品与业务事实
- [workspace/](workspace/CLAUDE.md)：当前工作与实现状态
- [drafts/](drafts/CLAUDE.md)：待确认事项

## 当前项目约束

- 现场考勤从手机扫码调整为海康人脸识别设备/闸机。
- 移动端不提供扫码打卡；移动端主要用于查询本人考勤、项目切换、个人信息和人脸同步状态。
- 设备原始事件不可修改；平台考勤结果由规则计算，人工处理以补录为主。
