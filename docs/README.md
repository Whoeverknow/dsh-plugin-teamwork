# 📚 docs — 设计文档索引（可溯源）

四份文档是一条完整论证链：**理论 → 对比 → 优化 → 设计与自动调用**。

| 文档 | 一句话 | 溯源 |
|---|---|---|
| 🧠 [DISCUSSION.md](DISCUSSION.md) | 多 Agent × Teamwork 四线研讨：理论谱系、验证天花板定理、落地、三案例 | 源自 Google Antigravity [博客](https://antigravity.google/blog/teamwork-when-ai-becomes-a-research-partner)（2026-08-27）+ [/docs/teamwork](https://antigravity.google/docs/teamwork)；DSH 服务契约实测 |
| ⚖️ [COMPARISON.md](COMPARISON.md) | 与 DSH 现有五件套逐项对比 + 判定矩阵 + 不取代原则 | DSH 运行时实测契约（subagent/workflow/ralph/goals/agentTeams） |
| 🔧 [OPTIMIZATION.md](OPTIMIZATION.md) | 十大失败模式药方 + 四个高杠杆 + 战役默认优化栈 | 基于 DISCUSSION 的验证天花板定理推演 |
| 🎯 [DESIGN.md](DESIGN.md) | 插件完整设计：理论→服务映射、自动调用三层触发+反馈环、发布路线、风险 | 契约实测 + 官方 `dsh-experimental-agent-team` 0.1.7-rc.2 源码核验 |

## 🧭 证据链速览

| 主张 | 证据位置 |
|---|---|
| 契约对齐官方 | [DESIGN.md](DESIGN.md) §一；官方 [monorepo](https://github.com/deepseek-ai/deepseek-harness) `packages/experimental/agent-team` |
| 21/21 断言通过 | [test/smoke.ts](../dsh-plugin-teamwork/test/smoke.ts)（可复现命令见根 README） |
| 理论有出处 | [DISCUSSION.md](DISCUSSION.md) 开头「素材来源」 |

> 每份文档的理论主张均可向上追溯到：官方博客原文 → 本文档 → 代码/测试。