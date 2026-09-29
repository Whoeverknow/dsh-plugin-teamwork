# DeepSeek 社区 Teamwork 插件 —— 完整交付物

本目录是「多 Agent / Teamwork → DeepSeek 社区插件」讨论的最终产物，包含一份设计论证与一个可发布的包骨架。

> 设计原则（贯穿全部内容）：**不取代官方 Agent、默认 ask、预算封顶、do-not 硬约束、官方工具零遮蔽**。
> 插件是官方 Agent 的一层「战役反射弧」，不是替代品；官方转正之日即合并进官方之时。

## 目录

```
1-WorkAll/
├─ README.md                     ← 本文件（导航）
├─ docs/
│  ├─ DISCUSSION.md              ← 多 Agent × Teamwork 四线研讨（理论谱系 / 验证天花板 / 落地 / 实例）
│  ├─ COMPARISON.md              ← 与 DSH 现有对象逐项对比 + 判定矩阵 + 不取代原则
│  ├─ OPTIMIZATION.md            ← 十大失败模式药方 + 四个高杠杆 + 战役默认优化栈
│  └─ DESIGN.md                  ← 插件完整设计（映射表 / 自动调用三层触发 + 反馈环 / 发布路线 / 风险）
└─ dsh-plugin-teamwork/          ← 可发布的插件包骨架（P1：thin pattern 层 + 路由 + preset 并列扩展）
   ├─ package.json / tsconfig.json / LICENSE
   ├─ README.md / README.zh.md / README.i18n.yaml
   ├─ src/                       ← 全部模块（见包内 README 的模块地图）
   ├─ docs/patterns.md           ← 五个声明式 pattern 的规范
   └─ examples/                  ← profile bundle / 战役样例
```

## 一句话懂整包

- **它是什么**：`@dsh-community/dsh-plugin-teamwork`，挂载在官方 `agentTeams` 服务之上的 pattern 引擎 + 自动路由。
- **它不做什么**：不重建角色底座、不遮蔽官方工具、不接管日常单 Agent 路径。
- **核心价值**：把「生成候选 → 对抗验证 → 合成改进」的 GAS 循环规格化成可复用、带门控、带记忆、带预算的战役。

## 快速开始（阅读顺序）

1. `docs/DISCUSSION.md` —— 为什么多 Agent 值得用、天花板在哪
2. `docs/COMPARISON.md` —— 什么时候用插件、什么时候绝不用
3. `docs/OPTIMIZATION.md` —— 引擎内部要做什么才不烧钱
4. `docs/DESIGN.md` —— 插件的完整设计、自动调用、发布路线
5. `dsh-plugin-teamwork/README.zh.md` —— 包本身怎么构建、安装、发布

## 验证状态（已实测）

- **JSON 合法性**：package.json / tsconfig.json / examples/*.json 全部通过 `JSON.parse`。
- **纯逻辑冒烟**：`dsh-plugin-teamwork/test/smoke.ts` 共 **21 项断言全部通过**（Node ≥23.6 类型剥离直接运行 TS），覆盖：
  - L1 硬路由（关键词命中 / do-not 优先级 / workspace 提示 / 不可归类保持单 Agent）
  - 五个 pattern 不变量（Falsifier 配对、确定性验收门、预算健全）
  - Provenance 签名往返与防篡改；完整性模式；盲审匿名化
  - 分级验证漏斗（验收只认 expensive；验证器缺失绝不虚过）
  - 引擎端到端（假 agentTeams + 假 storageDomain 上：spawn→门→provenance→完成→战绩入 bandit）
  - 路由三模式（off/ask/auto）+ 预算封顶不可被模型覆盖
  - 插件入口模块级接线（全部 src 可链接加载）

运行：`node --import <abs>/test/load-ts-hooks.mjs test/smoke.ts`（Windows 下 --import 需 file:// 前缀）。
- **未执行**：真实 `tsc` 类型检查与真实 DSH 进程联调——本环境 npm registry 不可达（两次 registry 拉取均断连），且 `agentTeams` 为 rc 契约。发布前请在有网络的环境执行 `pnpm install && pnpm build` 并用官方插件管理器装载。