# 🧩 dsh-plugin-teamwork

DeepSeek Harness 多 Agent **Teamwork 插件** — thin pattern 层，跑在官方 `agentTeams` 服务之上。

**🤝 不取代官方 Agent** · **🙋 默认 ask** · **💰 预算封顶** · **🚫 do-not 硬约束** · **🛡️ 官方工具零遮蔽**

---

## 📁 仓库结构

| 路径 | 内容 |
|---|---|
| 📄 `docs/` | 四份设计文档：理论 → 对比 → 优化 → 设计（含自动调用） |
| 📦 `dsh-plugin-teamwork/` | 插件包：5 个声明式 pattern / 引擎 / 四层门 / 四域记忆 / 路由 / 3 工具 + `/teamwork` |
| 🧪 `test/smoke.ts` | 21/21 冒烟测试（可复现命令见下） |

## ✅ 证据链（为什么可信，不是吹）

| # | 声明 | 依据 | 如何复现/溯源 |
|---|---|---|---|
| 1️⃣ | 契约对齐官方 | 对照 `@deepseek-ai/dsh-experimental-agent-team`（0.1.7-rc.2）真实源码逐条比对：任务状态/动作枚举、`TeamTaskView` 字段、membership 语义全部一致 | [docs/DESIGN.md](docs/DESIGN.md) §一；官方 [monorepo](https://github.com/deepseek-ai/deepseek-harness) `packages/experimental/agent-team` |
| 2️⃣ | 21/21 断言通过 | 运行时验证（Node ≥23.6 类型剥离） | `node --import test/load-ts-hooks.mjs test/smoke.ts` 自行运行 |
| 3️⃣ | 接口基于实测 | 开发期对运行中 DSH 宿主执行 `cordis_inspect` 取真实服务契约 | [docs/DESIGN.md](docs/DESIGN.md) §一（agentTeams/storageDomain/systemPrompt） |
| 4️⃣ | 理论有出处 | Google Antigravity 官方博客 + `/docs/teamwork`（2026-08-27） | [博客原文](https://antigravity.google/blog/teamwork-when-ai-becomes-a-research-partner) / [官方文档](https://antigravity.google/docs/teamwork) |
| 5️⃣ | 设计有闭环 | 四份文档形成 理论→对比→优化→自动调用 链条 | [docs/README.md](docs/README.md) 索引 |

## 🧭 溯源地图

```
🧠 理论来源 ──► Google Antigravity 博客 + /docs/teamwork ──► docs/DISCUSSION.md
🔬 契约实测 ──► 宿主 cordis_inspect（agentTeams 服务）──► src/types/dsh.ts
📦 源码核验 ──► 官方 dsh-experimental-agent-team 0.1.7-rc.2 ──► docs/DESIGN.md §一
🧪 可复现验证 ─► test/smoke.ts（21/21）──► README「证据链 2️⃣」
📚 设计落地 ──► docs/（DISCUSSION→COMPARISON→OPTIMIZATION→DESIGN）──► dsh-plugin-teamwork/src
🚀 发布 ──────► Release v0.1.0（附录含原文引用与全部链接）
```

## 🚀 快速开始

```bash
cd dsh-plugin-teamwork
pnpm install && pnpm build          # 构建 lib/
# 接入 profile：dsh.profile.bundles 加入本包，或插件管理 install_bundle
/teamwork <目标>                     # 手动触发（L0）；开启 ask/auto 后复杂任务自动路由
```

## 🧪 验证

```bash
node --import test/load-ts-hooks.mjs test/smoke.ts   # 21/21 通过
```

## 📄 License

MIT。设计参考 Google Antigravity 官方公开材料；与 DeepSeek / Google 无隶属或背书关系。