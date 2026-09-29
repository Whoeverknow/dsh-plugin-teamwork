# 多 Agent 合作优化方案

> 优化哲学：**优化的方向不是加更多 Agent，而是削减——削减无效验证、削减冗余上下文、削减无信息通信。合作从"聊天文化"改造成"流水线文化"：每个环节只传递两样东西——状态和证据。**
>
> 📎 溯源：各优化项对应的 DSH 服务（spillStore/storageDomain/invariants/schedule/agentTeams 等）均经运行中宿主实测；索引见 [docs/README.md](README.md)。

## 一、优化总原则

1. 协作的本质是传递**验证信号**，不是传递文本 → 通信优化为"状态 + 证据"，聊天降到最低。
2. **验证器是天花板** → 预算与调度围绕验证硬度，不围绕生成数量。
3. **上下文是稀缺资源** → 每个 token 只给需要的 Agent，且随时可降级为引用。
4. **成本必须可预期** → 并行是乘法，必须有预算门。

## 二、按失败模式开药方（十项）

| # | 失败模式 | 优化方案 | 机制 | 预期增益 | DSH 落点 |
|---|---|---|---|---|---|
| 1 | 群体思维/确认偏差 | **盲审（去标识批判）** + 异质化 | Critic 收到的候选不署名；Explorer 与 Critic 混用不同模型/提示策略 | 消除"同意同伴"的社会性压力 | gates：spawnTeammate 时匿名化投递 |
| 2 | 上下文账本爆炸 | **结构化交接 + 消息降级为引用** | 消息只传 (摘要, evidenceRefs)，全文进 spill/文件，按需取引用 | 上下文占用 ↓60–80%，审计自动 | 已有 `spillStore`；插件定交接 schema |
| 3 | 长战役自毁/失败后置 | **连续验证心跳 + 关键路径优先** | 每子任务完成即触发 invariants+抽样回归；高风险先做先验证 | 失败信号提前到达，无效路径预算提前释放 | 已有 `invariants`、`schedule` |
| 4 | 成本失控（乘法空间） | **UCB 式自适应并行 + 提前终止 + 去重 + KV 复用** | 候选分配按 `均值 + c·√(ln T/n)`；边际改进<阈值即停；相似候选过滤；相似 prompt 共享前缀 | 同预算有效覆盖 ↑30–50% | 分配器/去重器（storageDomain 计分域） |
| 5 | 同源验证 | **验证硬度分级门** | cheap(lint, ~0.01×) → medium(单测, ~0.1×) → expensive(集成/基准/oracle, 1×)；expensive 只跑幸存者，验收只认 expensive | 验证 token 成本 ↓70–90%，最终门硬度不变 | verify.ts；验收逻辑 |
| 6 | 失败教训不复用 | **负知识结构化** | pitfall 带 (签名, verifierId, 发现轮次)，按签名去重、设时效 | 跨战役复用率 ↑，过时陷阱不误伤 | 已有 storageDomain；memory |
| 7 | 信用分配模糊 | **Provenance 链** | 每次门控签字 (candidateId, verifierId, evidenceRef, signature)，revision CAS 天然审计 | 归因到角色 → 定向调优 | 已有 agentTeams CAS/ownerName |
| 8 | 监督链到顶 | **Sentinel 漂移检测 + 评审评审** | 监测验收率/证据完整度异常（验收率骤升=放水信号）；Success Auditor 第二组盲审复核 | 监督者本身被监督 | governance 层；复用 approval |
| 9 | 分解低效/写冲突 | **依赖感知认领 + 冲突预检** | claim 前置条件=全部 blocker ready；writeScopes 调度期预检重叠 | 并行无等待、无覆盖 | 已有 blockedBy/writeScopes/CAS |
| 10 | 模式僵化 | **Pattern 战绩库（bandit）** | 每战役记录 (pattern, cost, rounds, success) 进知识域；模式选择数据驱动 | 模式选择随战绩进化 | memory 扩展 |

## 三、四个高杠杆深挖

### A. 通信即状态机（杠杆最大）
任务板 + 证据引用替换自由聊天：`sendMessage` 必须携带 `evidenceRefs`；每次 `updateTask` 自动生成可审计记录；队友只见与自己相关的任务板切片。效果：上下文 ↓60–80%、归因自动、审计免费。代价：工具 schema 约束变严——这是 `ralph`"invalid reports fail the workflow"哲学的推广。

### B. 风险感知调度 + 连续验证心跳
子任务挂 (风险, 验证成本, 依赖) 元数据；调度按 失败影响×失败概率/验证成本 排序，高风险高优先级先跑先验证；每子任务完成触发 invariants + 抽样回归。把博客"silent execution gap"的 lockstep 对策翻译成 DSH 原语。

### C. UCB 式锦标赛预算分配
固定 N 路改按不确定性分配：高分高确定分支少投，低分高不确定分支多投；被证伪路线保留少量采样预算做"有用观点挖掘"（兼容博客"broken route may still contain a useful idea"）。

### D. 验证预算分级门
```
候选池 → [lint/静态 ~0.01×] 过滤~50% → [单测 ~0.1×] → [集成/基准/oracle 1×] → 验收(只认此级)
```
cheap 门宁过勿杀（阈值放宽防误杀）。验收门永远只认 expensive——**天花板定理的正向应用：把预算花在硬验证上，而不是软验证上**。

## 四、战役默认优化栈

```
通信    结构化交接 + 证据引用 + 任务板唯一事实源
调度    关键路径 + 风险优先 + claim 前置(blocker ready)
验证    分级门(cheap→medium→expensive) + 心跳 + 盲审批判 + 确定性验收 + provenance 签字
预算    maxAgents/maxRounds/边际停止 + UCB 分配 + 候选去重 + KV 前缀复用
记忆    四域(pitfalls/knowledge/attempts/evidence) + 战绩库 + pitfall 去重时效
治理    checkpoint 每 N 轮 + 漂移检测 + 人工验收门(approval)
```

## 五、落地映射：DSH 现成 vs 插件要写

**直接复用（零开发）**：`spillStore`（引用化载体）、`storageDomain`（记忆域）、`invariants`（心跳断言）、`schedule`（定时回归）、`agentTeams` 的 blockedBy/writeScopes/CAS/ownerName（并发安全+审计链）、`goals`（checkpoint 载体）、`tool-jobs`（验证输出审计）、`approval`（验收门）、`systemPrompt`（按角色裁剪上下文）。

**插件要写（六件）**：
1. 任务板 schema 扩展：风险/验证成本/证据 refs/署名位 元数据；
2. 交接协议：结构化报告 schema + 证据引用校验（硬校验）；
3. 分级验证编排 + 连续心跳触发器；
4. UCB 分配器 + 候选去重器（storageDomain 计分域）；
5. 盲审去标识投递；
6. Sentinel 漂移检测（验收率/证据完整度监控）。

**路线**：P0 契约与 schema → P1 引擎+分级门+心跳 → P2 UCB+去重+战绩库 → P3 漂移检测+评审评审。

> 一句话收束：优化的本质是把"多 Agent 的合作"从聊天文化改造成"流水线文化"——每个环节只传递状态和证据。规模不决定上限，验证密度与信息效率决定上限。