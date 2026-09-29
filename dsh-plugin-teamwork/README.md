# @dsh-community/dsh-plugin-teamwork

A **thin pattern-layer** engine for DeepSeek Harness: declarative multi-agent campaigns (GAS loops with adversarial gates, tiered verification, four-domain memory, provenance) on top of the official `ctx.agentTeams` service.

> **Chapter 1 — The "Do Not Replace" promise.**
> This plugin does **not** replace the official agent. It is one layer of "campaign reflex" on top of it.
> 1. Tasks the official agent can already finish alone → zero intervention (the router's do-not rules are hard constraints and must state a reason — auditable).
> 2. Every campaign runs on the official `agentTeams` service (no re-implemented role substrate).
> 3. Official toolset on/off is identical except for added `teamwork_*` tools → no shadowing, no overrides.
> 4. Removing the plugin restores the system exactly — no residue.
> The correct framing is reversed: this plugin is a **candidate official capability** — the day the official agent-team turns stable, it merges upstream.

---

## What it is / is not

| Is | Is not |
|---|---|
| Declarative patterns: `iterative_coding`, `distributed_coding`, `long_proof`, `self_verification`, `document_review` | A re-implementation of roles/messaging/task-board (that is `ctx.agentTeams`) |
| Auto-invocation router: L1 hard rules + L2 LLM router + L3 runtime escalation + battle-log bandit | A replacement for normal single-agent / workflow / ralph paths |
| Budget caps that the model cannot override; modes `off / ask / auto` | A way to burn credits silently |
| Tiered verification (cheap→medium→expensive; acceptance only trusts *expensive*), blind critique, provenance signatures, integrity modes | A magical intelligence amplifier |

## When to use / When NOT to use

| Use the plugin when | Do NOT use (router do-not rules) |
|---|---|
| Open-ended, long-horizon research (hours–days) | Single bug fixes, tiny features (verifiable instantly) |
| Decomposable into a dependency DAG (`blockedBy`) | Anything an official single-agent loop already handles |
| A trustworthy verifier exists (tests, benchmarks, formal tools) | A task that cannot be classified into any pattern |
| High cost of error (checkpoints required) | Jokes, prose, one-shot chat |

Rule of thumb: **classifiable + verifiable + high error cost → pattern engine; decomposable but not classifiable → `workflow`; single-objective iteration → `ralph`; everything else → single agent.**

## Module map

```
src/
├─ index.ts          # plugin entry: export { Config, apply, inject, name }
├─ types/dsh.ts      # minimal structural type stubs of official services (REPLACE with real @deepseek-ai/dsh-* types at build time)
├─ types/contracts.ts# own types: PatternSpec, Budget, CampaignRequest/State/Report, RouterDecision, Provenance…
├─ patterns/index.ts # five declarative patterns + L1 keyword rule table + analyzePrompt()
├─ engine.ts         # TeamworkEngine: start → spawn → task board → waitForChange loop → gates → report
├─ gates.ts          # falsify→critic→verify→success-audit tiers, integrity modes, blind critique
├─ verify.ts         # deterministic verifier adapters + provenance signature (dependency-free hash)
├─ memory.ts         # pitfalls/knowledge/attempts/evidence domains + battle log + bandit weights
├─ router.ts         # L1/L2/L3 triggering, off/ask/auto modes, budget ceiling enforcement
├─ tools.ts          # teamwork_router / teamwork_status / teamwork_control
├─ command.ts        # /teamwork command + scoping interview + approval gate
└─ system-prompt.ts  # routing-rules section injection (decision matrix + do-not rules)
```

## Auto-invocation (three triggers + one feedback loop)

```
user prompt → ① entry router (L1 hard rules / L2 model router) → ② engine campaign
                         └── ③ runtime escalation (failures≥3 / context bloat / stall)
                                       └── battle log → bandit → next routing
```

Modes: `off` (manual `/teamwork` only) · `ask` (interview once + approval, default) · `auto` (within budget, interview once; spills over → ask).

## Install & quick start

Prereqs: DSH with the official (`experimental`) `agentTeams` service available; core dsh packages at the peer range (`^0.1.x`, `@deepseek-ai/cordis ^4.x`).

```bash
# 1. build
pnpm install && pnpm build          # produces lib/

# 2. wire into a profile (pick one)
#    a) profile package.json: add "@dsh-community/dsh-plugin-teamwork" to dsh.profile.bundles
#    b) plugin manager: install_bundle with the package name + registry (npm default)
#    c) or add as a row in a cordis.yml / agent preset agent.cordis.yml (parallel preset; never override official tools)

# 3. use
/teamwork <goal>                      # manual (L0)
# after enabling auto/ask routing, complex prompts self-route (L1/L2)
```

## Build & publish

```bash
pnpm build                  # tsc → lib/
npm pack                    # inspect tarball
npm publish --access public # registry.npmjs.org (default)
```

**Publish notes**: peer ranges are prerelease-anchored (`^0.1.2-rc.1`) so they resolve against the running DSH core (`0.1.7-rc.2` family). Before publishing, pin the exact core version of the DSH you verified against — mirror the official experimental package convention (`@deepseek-ai/dsh-experimental-agent-team` pins exact `0.1.7-rc.2` peers). Contract alignment was verified against that package's real source (task statuses/actions, task view shape, membership semantics) — keep `src/types/dsh.ts` in sync when the rc freezes.

Roadmap: P0 pattern DSL + docs · **P1 this skeleton** (engine + gates + router + command) · P2 memory UI + budget visualization · P3 merge into official agent-team when it turns stable.

## Risks / honest limits

- `agentTeams` is still an rc contract — the type stubs are centralized in `types/dsh.ts` for a one-file upgrade.
- Same-family "adversaries" share blind spots → deterministic verifiers are the acceptance gate; LLM critique is heuristic only.
- Tournament = multiplicative cost → budget is a Config ceiling the model cannot override (spills to `ask`).
- Long campaigns bloat the Lead session → messages degrade to references, conclusions promote into memory domains.
- Supervision tops out at the lead agent → periodic human checkpoints by default.

## License

MIT. Not affiliated with or endorsed by DeepSeek or Google. Design informed by public materials: Google Antigravity blog *Teamwork: When AI Becomes a Research Partner* (2026-08-27) and the `/docs/teamwork` documentation.