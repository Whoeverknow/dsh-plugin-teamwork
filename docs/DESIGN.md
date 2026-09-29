# dsh-plugin-teamwork 完整设计

> 本文件是包骨架 `dsh-plugin-teamwork/` 的设计总纲：理论 → 服务映射、自动调用架构、发布路线、风险登记。代码细节见包内 README 与 src 各模块头注释。
>
> 📎 溯源：服务映射以运行中宿主 `cordis_inspect` 实测 + 官方 `dsh-experimental-agent-team`（0.1.7-rc.2）源码核验为准；索引见 [docs/README.md](README.md)。

## 一、定位

`@dsh-community/dsh-plugin-teamwork` —— 挂在官方 `agentTeams` 服务之上的 **pattern 引擎 + 自动路由**。它是官方 Agent 的一层"战役反射弧"，不取代官方 Agent。

- **接管面仅一格**：编排策略的选择（要不要用团队、用哪个 pattern、花多少预算）。
- **执行仍走官方**：角色 `agentTeams.spawnTeammate`、任务板 `createTask/updateTask`、消息 `sendMessage`、等待 `waitForChange`、打断 `interrupt`。
- **记忆走官方**：`storageDomain` 开四域 + 战绩域。
- **治理走官方**：`userQuestions`（访谈）、`approval`（验收门）、`invariants`（心跳断言）、`goals`（跨轮）。

## 二、理论 → 服务映射表

| 博客/讨论理论 | 实现模块 | DSH 服务 |
|---|---|---|
| pattern=声明式规范 | `src/patterns/*`（JSON Schema 可序列化） | —（纯数据） |
| GAS 循环（生成-对抗-合成） | `src/engine.ts` 主循环 | agentTeams: spawnTeammate/sendMessage/waitForChange |
| 分解 + 依赖图 | 任务板 blockedBy → 拓扑序 | agentTeams: createTask/updateTask/getTask/listTasks |
| 四层验证塔 | `src/gates.ts` falsify→critic→verify→success-audit | tools / tool-jobs（确定性验证）+ LLM Critic（启发式） |
| 完整性模式 | `gates.ts` development/demo/benchmark | Config + systemPrompt 注入 |
| 记忆四件套 | `src/memory.ts` pitfalls/knowledge/attempts/evidence | storageDomain |
| 战绩库（bandit） | `memory.ts` battle 域 + `router.ts` | storageDomain |
| 盲审（去标识批判） | `gates.ts` anonymize | spawnTeammate prompt 模板 |
| 预算治理 | `router.ts`/`engine.ts`（Config 为 ceiling） | 继承 ralph"config 是上限"哲学 |
| 自动调用三层触发 | `router.ts` L1 硬 + L2 软 + L3 升级 | systemPrompt section + tools + invariants/goals |
| 不取代原则 | `command.ts`/`index.ts`（无 overrides、并列 preset） | preset 并列扩展 |

## 三、自动调用架构（三层触发 + 一个反馈环）

```
用户 prompt 进入 ──→ ① 入口路由(任务开头) ──→ ② 战役执行(引擎)
                              │                          │
                              └─ ③ 运行中提升(升级条件) ──┘
                                      │
                                      └── 战绩库(bandit) ←── 每战役结束
```

| 层 | 触发时机 | 谁决策 | 机制 | 模块 |
|---|---|---|---|---|
| L0 手动/快捷 | 用户显式 | 用户 | `/teamwork <目标>` | command.ts |
| L1 硬路由（确定性预检） | 任务进入前 | 规则 | 关键词/workspace 提示 → 强命中固定 pattern；do-not 关键词优先级最高 | router.ts |
| L2 软路由（模型分类） | 任务开头第一轮 | 顶层 agent | 注入路由规则 + 调用 `teamwork_router`（结构化输出，do-not 必须给理由） | tools.ts + system-prompt.ts |
| L3 运行中提升 | 中途 | 护栏 | 失败≥3/上下文近压缩/停滞 → escalate（走 approval 门） | router.ts（信号）+ engine.ts |
| 反馈闭环 | 每战役结束 | 数据 | 战绩入库 → bandit → 影响下次路由 | memory.ts |

**运行模式（全局开关）**：
```
off   → 仅 /teamwork 手动
ask   → 命中 → 访谈一次 + approval 都问（默认）
auto  → 命中且预算内 → 自动跑（访谈一次 + 预算帽），超帽降级 ask
```

**防滥用三道闸**：① do-not 硬约束且必须给理由（false 也要解释）；② 预算硬顶不可被模型覆盖（Config 是 ceiling，超帽自动降 ask）；③ 访谈每会话一次（scope 缓存）。

## 四、模块地图（src/）

| 文件 | 职责 |
|---|---|
| `index.ts` | 插件入口 `export { Config, apply, inject, name }`；装配所有模块 |
| `types/dsh.ts` | 官方服务契约的**最小结构类型桩**（生产构建替换为 @deepseek-ai/dsh-* 真实类型） |
| `types/contracts.ts` | 自有类型：PatternSpec/Budget/CampaignRequest/CampaignState/RouterDecision/Provenance… |
| `patterns/index.ts` | 五个声明式 pattern + L1 关键词规则表 + `analyzePrompt()` |
| `engine.ts` | TeamworkEngine：start→spawn→任务板→waitForChange 循环→门控→报告 |
| `gates.ts` | 四层门 + 完整性模式 + 盲审 + 验证分级 |
| `verify.ts` | 确定性验证器适配 + provenance 签名（无依赖 hash） |
| `memory.ts` | 四域 + 战绩域 + bandit 权重 |
| `router.ts` | L1/L2/L3 + 模式开关 + 预算封顶 |
| `tools.ts` | `teamwork_router` / `teamwork_status` / `teamwork_control` 三个工具 |
| `command.ts` | `/teamwork` 命令 + 范围访谈 + approval 门 |
| `system-prompt.ts` | 路由规则 section 注入 |

## 五、发布路线

| 阶段 | 交付 | 退出条件 |
|---|---|---|
| P0 | pattern DSL + 判定矩阵文档 + 空引擎 | 契约冻结确认 |
| P1（本骨架） | 引擎 + 四层门 + `/teamwork` + 路由工具 + preset 并列扩展 | 三角色冒烟战役跑通 |
| P2 | 记忆四域 + 预算可视化 + provenance UI | 长战役 24h 无上下文膨胀 |
| P3 | 与官方 agent-team 合并演进 | 官方转正或分歧确认 |

**构建与发布**：`pnpm build`（tsc → lib/）→ 本地验证（profile package.json 的 `dsh.profile.bundles` 加一行，或插件管理 `install_bundle`）→ `npm publish`（默认公共 registry）→ 双语 README + LICENSE(MIT) → 官方收录走 `github.com/deepseek-ai/deepseek-harness` monorepo PR。

## 六、风险登记与缓解

| 风险 | 缓解 |
|---|---|
| `agentTeams` rc 契约变动 | P0 解耦；契约桩集中在一个文件 |
| 同源偏差 | 验证主力确定性；LLM 批判只做启发式 |
| 成本失控 | Config 预算 ceiling + 超帽降 ask |
| Lead 会话账本膨胀 | 聊天降级为引用 + 结论进记忆域 |
| 监督链到顶 | 每 N 轮人工 checkpoint + 漂移检测 |
| 与官方撞车/被吸收 | 不取代原则 + thin 层姿态 + 合并路线 |

## 七、不取代原则（发布承诺，写进 README 第一章）

1. 官方 Agent 单跑能成的任务 → 零介入（可审计）；2. 战役全走官方 agentTeams；3. 官方工具零遮蔽（仅新增 teamwork_*）；4. 移除插件即完全恢复。取代关系是反方向的：插件是"候选的官方能力"。