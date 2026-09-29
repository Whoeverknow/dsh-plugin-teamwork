# 插件 vs DSH 现有多 Agent 能力：对比与判定矩阵

> 「现有对象」= DSH 现在就已具备的多 Agent 能力栈（全部经实测契约核对）；「插件」= `@dsh-community/dsh-plugin-teamwork`（thin pattern 层，跑在 `agentTeams` 之上）。

## 一、基线盘点：DSH 现有五件套

| 现有对象 | 是什么 | 关键能力 |
|---|---|---|
| `subagent` / `subagent_fork` | 一次性委派 | 独立上下文 / fork 继承 / continuable 子代理（send_message、interrupt、list） |
| `workflow`（`workflowEngine`） | 脚本编排 | agent / pipeline（无屏障、条目级故障隔离）/ parallel（屏障）/ phase / JSON Schema 校验 / caps |
| `ralph`（`tool-ralph`） | 固定前台循环 | 单目标、每轮一个新鲜子代理、仅结构化交接报告跨轮、workspace 作记忆、maxRounds 上限、终态 complete/blocked/budget-limited |
| `goals`（goal-round-driver） | 跨自动续轮长任务 | 持久目标、逐轮驱动、pause/resume/blocked 规则 |
| `agentTeams`（实验性） | 团队基础设施 | 命名角色（spawnTeammate）、消息、任务板（blockedBy 依赖图 / writeScopes 文件所有权 / revision CAS）、waitForChange、interrupt |

## 二、改进：插件补上的真空白

1. **编排从"模型每次现场写脚本"升级为"声明式可复用模式"**：对抗循环从每次重写变成可移植机制（GAS 循环跨域零修改）。这是五件套里唯一完全没有的东西。
2. **对抗门从"模型自觉"升级为"结构强制"**：Falsifier→Critic→Challenger+Auditor→Success Auditor 成为必须通过的门；Verifier 独立审计。结构性防群体思维。
3. **跨轮记忆从"散落 workspace"升级为"四域结构化"**：Pitfall Registry（answer-agnostic 负知识）/ Knowledge Directory / Prior Attempts / Computational Evidence；失败教训跨战役复用。
4. **预算、完整性与契约被规格化**：integrity 模式（development/demo/benchmark，禁读测试源码反推、禁抄开源核心）+ 两阶段范围访谈（"Specify What, Not How"）成为强制契约而非模型自觉。
5. **运行时自适应团队规模**：按问题形态决定 spawn 数与轮次，中途可调整——ralph/workflow 结构上做不到。

## 三、不足：插件的成本与软肋

1. **复杂度税**：对可分解但不可归类的任务、琐碎任务，全是开销没有收益（博客自承："For routine tasks, basic multi-agent approaches are often enough"）。
2. **建立在未冻结的沙地上**：`agentTeams` 是 rc 契约（bundle 元数据 0.1.7-rc.2 与已发布核心 0.1.2-rc.1 错位）；与官方 `experimental-agent-team-profile` 演进撞车，可能被吸收或分裂社区。
3. **同源偏差没被真解决**：Falsifier 与 Explorer 同族模型共享盲区。缓解：确定性验证器设为验收主力、LLM 批判降为启发式。
4. **成本可预测性退化**：锦标赛是 agent 数 × 轮次 × 上下文的乘法空间；必须内置预算上限且不可被模型覆盖。
5. **监督链到顶即断**：没人重启 Sentinel；需周期性人工 checkpoint。
6. **持久性代价转嫁 Lead 会话**：团队状态"backed by the live Lead Session log"——长战役需"聊天降级为引用、结论提升进记忆域"的主动归档，否则撞压缩。
7. **攻击面与治理面扩大**：多写入角色并行自动运行，权限/审批/沙箱要在角色粒度重配。

## 四、判定矩阵（何时用谁）

| 维度 | 单 Agent | workflow | ralph | plugin(pattern) |
|---|---|---|---|---|
| 视界 | 短 | 中 | 中长 | 长（数小时-数天） |
| 可分解 | 否 | 脚本可表达 | 否 | 声明式 DAG（blockedBy） |
| 验证可靠性 | 任意 | 任意 | 任意 | **必须高** |
| 错误代价 | 低 | 中 | 中 | 高（需人工 checkpoint） |
| 任务可否归类 | — | 否 | — | **可**（五个 pattern 之一） |
| 成本治理 | 天然 | caps | maxRounds | **需 Config 预算** |
| 反群体思维 | 无 | 靠模型自觉 | 无 | **结构强制门** |

**规则一句话**：可归类 + 可验证 + 错误代价高 → pattern；可分解但不可归类 → workflow；单目标迭代 → ralph；其余 → 单 Agent。

## 五、不取代原则（发布承诺）

插件不取代官方 Agent，四条可操作验收线：

1. 官方 Agent 单跑能成的任务 → 插件必须保持零介入（路由 do-not 硬约束 + 必须给理由，可审计）；
2. 插件所有战役都走官方 `agentTeams` 服务 → 不重复造角色底座；
3. 安装插件前后官方工具集差异 = 只多了 `teamwork_*` 工具 → 无遮蔽、无 overrides；
4. 移除插件后系统回到完全原样 → 无侵入、无残留状态依赖。

取代关系是反方向的：**社区插件是"候选的官方能力"，官方转正之日即合并进官方之时**。正确姿态 = 官方 roadmap 的提前实现 + 社区验证。