# 五个声明式 Pattern 规范

> 每个 pattern 是**数据**（JSON 可序列化），不是代码——引擎读取它，把角色与门控实例化到官方 `agentTeams` 服务上。对抗机制因此可跨领域零修改移植。

## 1. iterative_coding — 不可分解问题

- **适用**：重构、迁移、单模块实现/修复——必须"紧致实现→评审→验证→修订"循环。
- **角色**：Explorer（候选实现）×1-2 → Critic（盲审，可修订）→ Verifier（确定性验收）。
- **门控**：critic(启发式, medium) → verify(确定性, expensive, failAction=revise) → success-audit(确定性)。
- **预算默认**：maxAgents 3 / maxRounds 3 · **完整性默认**：development。
- **do-not**：小修复、typo、单行改动。

## 2. distributed_coding — 可分解工程

- **适用**：跨文件/多模块/库级改造（SDK 重构、monorepo 迁移），测试+基准可作 oracle。
- **角色**：Explorer（设计）→ Worker×N（隔离分支，各自 writeScopes）→ Critic（盲审）→ Verifier（独立审计）→ Synthesizer（合成）。
- **门控**：falsify(启发式) → critic(启发式) → verify(确定性, expensive, failAction=reset) → success-audit(确定性, failAction=reject)。
- **预算默认**：maxAgents 6 / maxRounds 4 · **完整性默认**：demo（禁抄开源核心/禁读测试源码反推）。
- **workspace 提示**：文件数 ≥8、存在测试套件 → L1 加分。

## 3. long_proof — 开放数学/TCS

- **适用**：定理/猜想/界——策略搜索优先于证明写作；失败潜伏期长 → 验证前置到策略层。
- **角色**：Explorer（策略）×N 与 Falsifier（配对证伪）×N → Synthesizer（合成树，携带异议）→ Verifier（证明验收）。
- **门控**：falsify(启发式, cheap, failAction=re-explore) → verify(**确定性, expensive, failAction=reset**；验收门只信形式化工具/反例搜索) → success-audit。
- **预算默认**：maxAgents 10 / maxRounds 8 · **完整性默认**：benchmark（最严）。
- 被证伪路线**带异议保留**（broken route may still contain a useful idea）。

## 4. self_verification — 逐步自检的深度推理

- **适用**：推导、形式化界、需要每步自检的数学长链（Aletheia 路线）。
- **角色**：Explorer（推理）×1 → Critic（每步盲检）→ Verifier（中间声明交叉验证）。
- **门控**：critic(启发式, cheap, failAction=revise，每步) → verify(确定性, medium)。
- **预算默认**：maxAgents 2 / maxRounds 6 · **完整性默认**：benchmark。

## 5. document_review — 论文/文档批判

- **适用**：论文、RFC、设计文档的多角度批判与合成。
- **角色**：Segmenter（分割）→ Critic×N（并行盲审）→ Synthesizer（合成）→ Verifier（对照原文/计算校验）。
- **门控**：critic(启发式, cheap) → verify(确定性, medium，引用与计算核对)。
- **预算默认**：maxAgents 4 / maxRounds 3 · **完整性默认**：development。

## 通用规则

- **验收门只认确定性验证器**（天花板定理：团队智能上限 = 验证器可靠度）；LLM 批判仅启发式、盲审（不署名候选）。
- **预算可被请求下调，不可上调**（Config ceiling 不可被模型覆盖）。
- **失败产生负知识**：任何门失败 → 写 Pitfall Registry（签名去重、带 verifierId 与轮次）。
- **每 2 轮人工 checkpoint**（监督链到顶的缓解）；`approval` 可作 checkpoint 门。