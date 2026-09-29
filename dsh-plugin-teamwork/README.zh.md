# @dsh-community/dsh-plugin-teamwork

DeepSeek Harness 的 **thin pattern 层**引擎：在官方 `ctx.agentTeams` 服务之上，提供声明式多 Agent 战役（GAS 循环 + 对抗门、分级验证、四域记忆、provenance 签名）。

> **第一章 ——「不取代」承诺。**
> 本插件**不取代**官方 Agent，它只是官方之上的一层"战役反射弧"。
> 1. 官方 Agent 单跑能成的任务 → 零介入（路由的 do-not 规则是硬约束且必须给出理由，可审计）；
> 2. 所有战役都走官方 `agentTeams` 服务（不重复造角色底座）；
> 3. 安装前后官方工具集差异 = 只多了 `teamwork_*` 工具（无遮蔽、无 overrides）；
> 4. 移除插件后系统完全恢复原样。
> 取代关系是反方向的：本插件是**候选的官方能力**——官方 agent-team 转正之日即合并进官方之时。

---

## 是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 声明式 pattern：`iterative_coding` / `distributed_coding` / `long_proof` / `self_verification` / `document_review` | 重建角色/消息/任务板（那是 `ctx.agentTeams` 的活） |
| 自动调用路由：L1 硬规则 + L2 模型路由 + L3 运行中升级 + 战绩 bandit | 取代普通单 Agent / workflow / ralph 路径 |
| 模型不可覆盖的预算上限；`off / ask / auto` 三模式 | 静默烧钱的黑洞 |
| 分级验证（cheap→medium→expensive，验收只认 expensive）、盲审、provenance、完整性模式 | 智能放大器魔法 |

## 什么时候用 / 什么时候绝不用

| 该用 | 绝不用（do-not 规则） |
|---|---|
| 开放、长视界研究（数小时-数天） | 单 bug 修复、小功能（可即时验证） |
| 可分解成依赖 DAG（blockedBy） | 官方单 Agent 循环本就能搞定的事 |
| 存在可信验证器（测试/基准/形式化工具） | 无法归入任何 pattern 的任务 |
| 错误代价高（需 checkpoint） | 闲聊、散文、一次性问答 |

黄金法则：**可归类 + 可验证 + 错误代价高 → pattern 引擎；可分解但不可归类 → workflow；单目标迭代 → ralph；其余 → 单 Agent。**

## 模块地图

```
src/
├─ index.ts          # 插件入口：export { Config, apply, inject, name }
├─ types/dsh.ts      # 官方服务契约的最小结构类型桩（生产构建替换为 @deepseek-ai/dsh-* 真实类型）
├─ types/contracts.ts# 自有类型：PatternSpec/Budget/CampaignRequest/CampaignState/CampaignReport/RouterDecision/Provenance…
├─ patterns/index.ts # 五个声明式 pattern + L1 关键词规则表 + analyzePrompt()
├─ engine.ts         # TeamworkEngine：start→spawn→任务板→waitForChange 循环→门控→报告
├─ gates.ts          # falsify→critic→verify→success-audit 四层、完整性模式、盲审
├─ verify.ts         # 确定性验证器适配 + provenance 签名（无依赖 hash）
├─ memory.ts         # pitfalls/knowledge/attempts/evidence 四域 + 战绩域 + bandit 权重
├─ router.ts         # L1/L2/L3 触发、off/ask/auto 模式、预算封顶
├─ tools.ts          # teamwork_router / teamwork_status / teamwork_control
├─ command.ts        # /teamwork 命令 + 范围访谈 + approval 门
└─ system-prompt.ts  # 路由规则 section 注入（判定矩阵 + do-not 规则）
```

## 自动调用（三层触发 + 一个反馈环）

```
用户 prompt → ① 入口路由(L1 硬规则 / L2 模型路由) → ② 引擎战役
                        └── ③ 运行中升级(失败≥3 / 上下文膨胀 / 停滞)
                                      └── 战绩 → bandit → 影响下次路由
```

模式：`off`（仅手动 `/teamwork`）· `ask`（访谈一次 + approval，默认）· `auto`（预算内自动、访谈一次；超预算降级 ask）。

## 安装与快速开始

前置：DSH 已具备官方（实验性）`agentTeams` 服务；核心 dsh 包满足 peer 范围（`^0.1.x`、`@deepseek-ai/cordis ^4.x`）。

```bash
# 1. 构建
pnpm install && pnpm build          # 产出 lib/

# 2. 接入 profile（任选其一）
#    a) profile package.json: 在 dsh.profile.bundles 加入 "@dsh-community/dsh-plugin-teamwork"
#    b) 插件管理器: install_bundle 填包名 + registry（默认 npm）
#    c) 作为一行加进 cordis.yml / agent preset 的 agent.cordis.yml（并列 preset，绝不 override 官方工具）

# 3. 使用
/teamwork <目标>                      # 手动（L0）
# 开启 auto/ask 路由后，复杂任务自动进路由（L1/L2）
```

## 构建与发布

```bash
pnpm build                  # tsc → lib/
npm pack                    # 检查 tarball
npm publish --access public # registry.npmjs.org（默认）
```

**发布注意**：peer 范围用预发布锚定（`^0.1.2-rc.1`），可解析到运行中 DSH 核心（0.1.7-rc.2 家族）。发布前请把你验证过的 DSH 核心版本钉成精确版本（仿照官方实验包 `@deepseek-ai/dsh-experimental-agent-team` 钉 `0.1.7-rc.2`）。契约已对照该包真实源码核对（任务状态/动作、任务视图、成员语义）——rc 冻结时保持 `src/types/dsh.ts` 同步。

路线图：P0 pattern DSL + 文档 · **P1 本骨架**（引擎+门+路由+命令）· P2 记忆 UI + 预算可视化 · P3 官方转正后合并。

## 已知局限（诚实声明）

- `agentTeams` 仍是 rc 契约——类型桩集中在 `types/dsh.ts`，升级只改一文件；
- 同族"对抗者"共享盲区 → 验收门只认确定性验证器，LLM 批判仅启发式；
- 锦标赛 = 乘法成本 → 预算是 Config 上限，模型不可覆盖（超帽降 ask）；
- 长战役膨胀 Lead 会话 → 消息降级为引用、结论提升进记忆域；
- 监督链到顶于 Lead → 默认周期性人工 checkpoint。

## License

MIT。与 DeepSeek、Google 无隶属或背书关系。设计参考公开材料：Google Antigravity 博客《Teamwork: When AI Becomes a Research Partner》(2026-08-27) 与 `/docs/teamwork` 文档。