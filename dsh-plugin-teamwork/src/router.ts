/**
 * router.ts — Auto-invocation: L1 hard rules, L2 model router, L3 runtime
 * escalation, and the off/ask/auto mode + budget-ceiling enforcement.
 *
 * The router answers three questions:
 *   1. should we use a team at all?   (do-not rules are hard constraints)
 *   2. which pattern?                 (L1 keywords + workspace hints + bandit)
 *   3. how much budget?               (Config ceiling, never raised by the model)
 */

import type { Budget, PatternId, RouterDecision, RouterMode } from "./types/contracts.js";
import { analyzePrompt, getPattern, type HardHint } from "./patterns/index.js";

export interface RouterConfig {
  readonly mode: RouterMode;
  readonly budgetCeiling: Budget;
  readonly bandit: (taskClass: string) => Promise<Readonly<Record<PatternId, number>>>;
}

export interface L2ModelDecision {
  readonly shouldUseTeam: boolean;
  readonly patternId?: PatternId;
  readonly confidence?: number;
  readonly reason: string;
  readonly requestedBudget?: Partial<Budget>;
}

export interface RoutingOutcome {
  readonly decision: RouterDecision;
  readonly proceed: boolean;
  readonly needsApproval: boolean;
  readonly budget: Budget;
}

export class TeamworkRouter {
  private readonly cfg: RouterConfig;

  constructor(cfg: RouterConfig) {
    this.cfg = cfg;
  }

  /** L2 soft decision (model-supplied) combined with L1 hard analysis. */
  async decide(
    prompt: string,
    hints: HardHint,
    modelDecision?: L2ModelDecision,
  ): Promise<RoutingOutcome> {
    if (this.cfg.mode === "off") {
      return this.#deny("router is off (manual /teamwork only).", "L1_hard");
    }

    const l1 = analyzePrompt(prompt, hints);
    /* L1 hard hits are decisive; a model L2 "no" cannot override a hard hit,
       but a model "yes" cannot override an L1 do-not denial either. */
    const shouldUse = l1.patternId !== undefined
      ? true
      : (modelDecision?.shouldUseTeam ?? false);

    if (!shouldUse) {
      return this.#deny(
        modelDecision?.reason ?? l1.reason,
        modelDecision ? "L2_model" : "L1_hard",
      );
    }

    const patternId = l1.patternId ?? modelDecision?.patternId;
    const pattern = patternId ? getPattern(patternId) : undefined;
    if (!pattern) {
      return this.#deny("no resolvable pattern — keep single-agent.", "L1_hard");
    }

    const taskClass = prompt.slice(0, 40);
    const bandit = await this.cfg.bandit(taskClass);
    const banditBoost = bandit[patternId] ?? 1;
    const confidence = Math.min(0.99, (l1.confidence || modelDecision?.confidence || 0.5) * banditBoost);

    /* budget: model may ASK for less; never more than the ceiling. */
    const requested: Budget = { ...pattern.budget, ...modelDecision?.requestedBudget };
    const budget: Budget = {
      maxAgents: Math.min(requested.maxAgents, this.cfg.budgetCeiling.maxAgents),
      maxRounds: Math.min(requested.maxRounds, this.cfg.budgetCeiling.maxRounds),
      verifyTiers: requested.verifyTiers,
      maxCampaignVerifyTokens: Math.min(
        requested.maxCampaignVerifyTokens,
        this.cfg.budgetCeiling.maxCampaignVerifyTokens,
      ),
      marginalImprovementStop: Math.max(
        requested.marginalImprovementStop,
        this.cfg.budgetCeiling.marginalImprovementStop,
      ),
    };

    const decision: RouterDecision = {
      shouldUseTeam: true,
      patternId,
      confidence,
      budget,
      reason: l1.reason,
      source: l1.patternId !== undefined ? "L1_hard" : "L2_model",
    };

    return {
      decision,
      proceed: true,
      needsApproval: this.cfg.mode === "ask",
      budget,
    };
  }

  #deny(reason: string, source: RouterDecision["source"]): RoutingOutcome {
    return {
      decision: { shouldUseTeam: false, confidence: 0, reason, source },
      proceed: false,
      needsApproval: false,
      budget: this.cfg.budgetCeiling,
    };
  }
}

/* ------------------------------------------------------------------ */
/* L3 runtime escalation                                               */
/* ------------------------------------------------------------------ */

export interface EscalationCounters {
  readonly failuresByTask: Map<string, number>;
  readonly roundsSinceProgress: number;
}

export type EscalationSignalKind = "repeated_failure" | "context_bloat" | "stall" | "verification_gap";

export class EscalationTracker {
  readonly failuresByTask = new Map<string, number>();
  roundsSinceProgress = 0;
  private readonly thresholds: { escalateAfterFailures: number };

  constructor(thresholds: { escalateAfterFailures: number }) {
    this.thresholds = thresholds;
  }

  noteFailure(taskId: string): void {
    this.failuresByTask.set(taskId, (this.failuresByTask.get(taskId) ?? 0) + 1);
  }

  noteProgress(): void {
    this.roundsSinceProgress = 0;
    this.failuresByTask.clear();
  }

  sample(): EscalationSignalKind | undefined {
    for (const count of this.failuresByTask.values()) {
      if (count >= this.thresholds.escalateAfterFailures) return "repeated_failure";
    }
    return undefined;
  }
}

/** Static helper for the system-prompt section text (decision matrix). */
export const ROUTER_RULES_TEXT = [
  "Teamwork (teamwork_router) is for: open-ended long-horizon work, decomposable tasks with a trustworthy verifier, high error cost.",
  "DO NOT use a team when: the change is instantly verifiable; the task cannot be classified into a pattern; the official single-agent loop already handles it.",
  "If you decide NOT to use the team, you MUST state the reason (do-not rule hit) — the refusal itself is auditable.",
  "Budget is a ceiling; you may request less, never more. Exceeding the ceiling degrades to ask mode.",
].join("\n");