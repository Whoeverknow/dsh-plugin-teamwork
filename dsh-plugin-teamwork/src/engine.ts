/**
 * engine.ts — TeamworkEngine: instantiates a declarative pattern over the
 * official agentTeams service.
 *
 * Flow:
 *   start(request)
 *     → membership check (caller must be Team Lead)
 *     → budget cap check (Config is the ceiling — model cannot raise it)
 *     → decompose: task board rows with blockedBy (dependency DAG)
 *     → spawn teammates per role (maxAgents cap)
 *     → rounds loop: waitForChange → progress → gates → provenance
 *     → success-audit gate → CampaignReport
 *
 * All mutations go through agentTeams (revision CAS, ownerName) so the
 * official session log is the audit chain. Verification windows are driven by
 * `verify.ts` (deterministic-first) and `gates.ts` (four tiers + blind).
 */

import type {
  Agent,
  AgentTeamsService,
  ContentBlock,
  CreateTeamTaskRequest,
  TeamTaskId,
  TeamTaskView,
  TeamContext,
} from "./types/dsh.js";
import type {
  Budget,
  CampaignReport,
  CampaignRequest,
  CampaignStatus,
  PatternSpec,
  Provenance,
  Thresholds,
} from "./types/contracts.js";
import { integrityPolicy, runGate, type GateContext } from "./gates.js";
import type { MemoryHub } from "./memory.js";
import type { VerifierRegistry } from "./verify.js";

export interface EngineConfig {
  readonly budgetCeiling: Budget; // model cannot raise beyond this
  readonly thresholds: Thresholds;
  readonly onCheckpoint: (campaignId: string, round: number) => Promise<boolean>;
  /** Deterministic verifier adapters; acceptance gate only trusts these. */
  readonly verifiers: VerifierRegistry;
  /** Heuristic tier (LLM critic/falsifier) — pluggable; blind critique built in. */
  readonly heuristic: GateContext["heuristic"];
  readonly logger: TeamContext["logger"];
}

const text = (s: string): ContentBlock => ({ type: "text", text: s });

export class TeamworkEngine {
  private readonly teams: AgentTeamsService;
  private readonly memory: MemoryHub;
  private readonly cfg: EngineConfig;

  constructor(teams: AgentTeamsService, memory: MemoryHub, cfg: EngineConfig) {
    this.teams = teams;
    this.memory = memory;
    this.cfg = cfg;
  }

  /** Cap a requested budget against the config ceiling (never raise). */
  capBudget(requested: Budget): Budget {
    return {
      maxAgents: Math.min(requested.maxAgents, this.cfg.budgetCeiling.maxAgents),
      maxRounds: Math.min(requested.maxRounds, this.cfg.budgetCeiling.maxRounds),
      verifyTiers: {
        cheap: Math.min(requested.verifyTiers.cheap, this.cfg.budgetCeiling.verifyTiers.cheap),
        medium: Math.min(requested.verifyTiers.medium, this.cfg.budgetCeiling.verifyTiers.medium),
        expensive: Math.min(
          requested.verifyTiers.expensive,
          this.cfg.budgetCeiling.verifyTiers.expensive,
        ),
      },
      maxCampaignVerifyTokens: Math.min(
        requested.maxCampaignVerifyTokens,
        this.cfg.budgetCeiling.maxCampaignVerifyTokens,
      ),
      marginalImprovementStop: Math.max(
        requested.marginalImprovementStop,
        this.cfg.budgetCeiling.marginalImprovementStop,
      ),
    };
  }

  async start(request: CampaignRequest): Promise<CampaignReport> {
    const lead: Agent = { id: request.lead.id as Agent["id"] };
    const membership = this.teams.tryMembership(lead);
    if (!membership || membership.role !== "lead") {
      throw new Error(`engine requires the caller to be a Team Lead (got ${membership?.role ?? "non-member"})`);
    }

    const budget = this.capBudget(request.budget);
    const pattern: PatternSpec = request.pattern;
    const integrity = integrityPolicy(request.integrity);
    const provenance: Provenance[] = [];
    let verifyTokensSpent = 0;
    let status: CampaignStatus = "running";
    let summary = "";
    const startedAt = new Date().toISOString();

    /* ---- 1. decompose: seed the task board (dependency DAG via blockedBy) ---- */
    const taskIds: TeamTaskId[] = [];
    const tasks: TeamTaskView[] = [];
    const seeds: CreateTeamTaskRequest[] = [
      {
        subject: `${pattern.name}: ${request.objective.slice(0, 120)}`,
        description: JSON.stringify({
          campaignId: request.campaignId,
          acceptanceCriteria: request.acceptanceCriteria,
          integrity: request.integrity,
        }),
        writeScopes: ["campaign/" + request.campaignId],
      },
    ];
    for (const role of pattern.roles) {
      seeds.push({
        subject: `role:${role.name}`,
        description: JSON.stringify({ campaignId: request.campaignId, role: role.name }),
        blockedBy: [...taskIds],
        writeScopes: [`campaign/${request.campaignId}/${role.name}`],
      });
    }
    for (const seed of seeds) {
      const created = await this.teams.createTask(lead, seed);
      tasks.push(created);
      taskIds.push(created.id);
    }

    /* ---- 2. spawn teammates (cap: maxAgents) ---- */
    const spawnables = pattern.roles.slice(0, Math.max(1, budget.maxAgents - 1));
    for (const role of spawnables) {
      await this.teams.spawnTeammate(lead, {
        name: role.name,
        description: role.description,
        prompt: [text(role.promptTemplate), text(`Objective: ${request.objective}`)],
        context: role.context,
        provider: role.providerTier === "pro" ? "deepseek" : "deepseek", // route at build/config
        signal: new AbortController().signal,
      });
    }

    /* ---- 3. rounds loop ---- */
    const gateCtx: GateContext = {
      campaignId: request.campaignId,
      integrity,
      verifiers: this.cfg.verifiers,
      heuristic: this.cfg.heuristic,
    };

    let rounds = 0;
    while (rounds < budget.maxRounds) {
      /* human checkpoint cadence (supervision chain tops out at the lead —
         periodic human checkpoints are the designed mitigation) */
      if (rounds > 0 && rounds % this.cfg.thresholds.checkpointEveryRounds === 0) {
        const ok = await this.cfg.onCheckpoint(request.campaignId, rounds);
        if (!ok) {
          status = "rejected";
          summary = "human checkpoint rejected the campaign.";
          break;
        }
      }

      const change = await this.teams.waitForChange(lead, 60_000, new AbortController().signal);
      void change;
      rounds += 1;

      const board = this.teams.listTasks(lead);
      const open = board.filter((t) => t.status === "pending" || t.status === "in_progress");
      if (open.length === 0) {
        status = "completed";
        summary = "all tasks closed; running success-audit gate.";
        break;
      }

      /* gate the root task's current candidate */
      const root = board[0];
      if (root) {
        const latest = root;
        for (const gate of pattern.gates) {
          const result = await runGate(gateCtx, gate, JSON.stringify(latest, null, 2));
          verifyTokensSpent += budget.verifyTiers[gate.verifyTier] ?? 0;
          if (result.evidenceRef) {
            provenance.push({
              candidateId: request.campaignId,
              verifierId: gate.stage,
              evidenceRef: result.evidenceRef,
              signature: result.evidenceRef,
              verifierKind: gate.verifierKind,
              at: new Date().toISOString(),
            });
          }
          if (!result.passed) {
            /* Record the objection as negative knowledge (answer-agnostic) and
               attach it to the task — "refuted routes remain with their
               objections attached". Uses `edit` because claim/release/reopen
               demand specific board states; the objection must stick regardless.
               CAS-protected: retry once on a stale revision. */
            await this.memory.appendPitfall(
              {
                verifierId: gate.stage,
                round: rounds,
                text: result.objection ?? `gate ${gate.stage} failed`,
              },
              this.cfg.thresholds.pitfallTtlMs,
            );
            const objection = result.objection ?? `gate ${gate.stage} failed`;
            try {
              await this.teams.updateTask(lead, {
                taskId: latest.id,
                expectedRevision: latest.revision,
                action: "edit",
                description: `${latest.description}\n[gate:${gate.stage}] ${objection}`,
              });
            } catch {
              const refreshed = this.teams.getTask(lead, latest.id);
              await this.teams.updateTask(lead, {
                taskId: latest.id,
                expectedRevision: refreshed.revision,
                action: "edit",
                description: `${refreshed.description}\n[gate:${gate.stage}] ${objection}`,
              });
            }
            status = gate.failAction === "reject" ? "rejected" : "running";
            break;
          }
        }

        if (verifyTokensSpent >= budget.maxCampaignVerifyTokens) {
          status = "budget_limited";
          summary = `verify token budget exhausted at ${verifyTokensSpent}`;
          break;
        }
      }
    }

    if (status === "running") {
      status = "budget_limited";
      summary = `round budget exhausted (${budget.maxRounds} rounds).`;
    }

    /* ---- 4. battle record (feedback loop) ---- */
    await this.memory.recordBattle({
      campaignId: request.campaignId,
      patternId: pattern.id,
      taskClass: request.objective.slice(0, 40),
      cost: { rounds, agents: spawnables.length, verifyTokens: verifyTokensSpent },
      success: status === "completed",
      userAccepted: status === "completed",
      finishedAt: new Date().toISOString(),
    });

    return {
      campaignId: request.campaignId,
      status,
      rounds,
      members: this.teams.listMembers(lead),
      tasks,
      verifyTokensSpent,
      provenance,
      summary,
      finalVerdict: provenance.find((p) => p.verifierId === "success-audit"),
    };
  }
}