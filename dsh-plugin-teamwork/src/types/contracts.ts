/**
 * types/contracts.ts — Domain types owned by this plugin.
 * These are serializable (JSON) so patterns, budgets, decisions and battle
 * records can live in storageDomains and cross process/session boundaries.
 */

import type { TeamMemberView, TeamTaskView, ContentBlock } from "./dsh.js";

/* ------------------------------------------------------------------ */
/* Identifiers                                                         */
/* ------------------------------------------------------------------ */

export type PatternId =
  | "iterative_coding"
  | "distributed_coding"
  | "long_proof"
  | "self_verification"
  | "document_review";

export type IntegrityMode = "development" | "demo" | "benchmark";
export type RouterMode = "off" | "ask" | "auto";
export type VerifyTier = "cheap" | "medium" | "expensive";
export type VerifierKind = "deterministic" | "llm_heuristic";

export type CampaignStatus =
  | "draft"
  | "running"
  | "gated"
  | "completed"
  | "budget_limited"
  | "rejected";

/* ------------------------------------------------------------------ */
/* Budgets & thresholds (Config is the ceiling — the model cannot      */
/* raise these at runtime; exceeding the ceiling degrades to ask).     */
/* ------------------------------------------------------------------ */

export interface Budget {
  readonly maxAgents: number;
  readonly maxRounds: number;
  readonly verifyTiers: Readonly<Record<VerifyTier, number>>; // per-verification token budget
  readonly maxCampaignVerifyTokens: number;
  readonly marginalImprovementStop: number; // UCB / bandit stop threshold
}

export interface Thresholds {
  readonly escalateAfterFailures: number; // L3: N consecutive failures on one subproblem
  readonly checkpointEveryRounds: number; // human checkpoint cadence
  readonly pitfallTtlMs: number;
}

export const DEFAULT_BUDGET: Budget = {
  maxAgents: 6,
  maxRounds: 4,
  verifyTiers: { cheap: 1_000, medium: 10_000, expensive: 100_000 },
  maxCampaignVerifyTokens: 400_000,
  marginalImprovementStop: 0.05,
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  escalateAfterFailures: 3,
  checkpointEveryRounds: 2,
  pitfallTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/* ------------------------------------------------------------------ */
/* Pattern specification (declarative, JSON-serializable)              */
/* ------------------------------------------------------------------ */

export interface RoleSpec {
  readonly name: string;
  readonly description: string;
  readonly promptTemplate: string;
  readonly context: "fresh" | "fork";
  readonly providerTier: "flash" | "pro" | "mixed";
  readonly adversarialPairOf?: string; // e.g. falsifier pairs with explorer
  readonly blind?: boolean; // critique receives anonymized candidates
  readonly toolsGranted?: readonly string[]; // e.g. ["bash", "fs"] for workers only
}

export interface GateSpec {
  readonly stage: "falsify" | "critic" | "verify" | "success-audit";
  readonly verifierKind: VerifierKind;
  readonly verifyTier: VerifyTier;
  readonly failAction: "revise" | "re-explore" | "reset" | "reject";
  readonly description: string;
}

export interface PatternSpec {
  readonly id: PatternId;
  readonly name: string;
  readonly description: string;
  readonly when: {
    readonly keywords: readonly string[];
    readonly doNotKeywords: readonly string[];
    readonly workspaceHints?: readonly string[]; // checked by L1 hard router
  };
  readonly roles: readonly RoleSpec[];
  readonly gates: readonly GateSpec[];
  readonly budget: Budget;
  readonly integrityDefault: IntegrityMode;
}

/* ------------------------------------------------------------------ */
/* Campaign runtime                                                    */
/* ------------------------------------------------------------------ */

export interface CampaignRequest {
  readonly campaignId: string;
  readonly pattern: PatternSpec;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly integrity: IntegrityMode;
  readonly budget: Budget;
  readonly lead: { readonly name: string; readonly id: string };
  readonly verifyAdapterIds?: readonly string[]; // deterministic verifiers wired at config
}

export interface CampaignState {
  readonly campaignId: string;
  readonly status: CampaignStatus;
  readonly rounds: number;
  readonly members: readonly TeamMemberView[];
  readonly tasks: readonly TeamTaskView[];
  readonly verifyTokensSpent: number;
  readonly provenance: readonly Provenance[];
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface Provenance {
  readonly candidateId: string;
  readonly verifierId: string;
  readonly evidenceRef: string;
  readonly signature: string; // hash(candidateId|verifierId|evidenceRef|verifierKind)
  readonly verifierKind: VerifierKind;
  readonly at: string;
}

export interface CampaignReport {
  readonly campaignId: string;
  readonly status: CampaignStatus;
  readonly rounds: number;
  readonly members: readonly TeamMemberView[];
  readonly tasks: readonly TeamTaskView[];
  readonly verifyTokensSpent: number;
  readonly provenance: readonly Provenance[];
  readonly finalVerdict?: Provenance; // success-audit signature (or rejection)
  readonly summary: string;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export interface RouterDecision {
  readonly shouldUseTeam: boolean;
  readonly patternId?: PatternId;
  readonly confidence: number; // 0..1
  readonly budget?: Budget;
  readonly reason: string; // must explain why (also when NOT used)
  readonly source: "L1_hard" | "L2_model" | "L3_escalation" | "manual";
}

export interface BattleRecord {
  readonly campaignId: string;
  readonly patternId: PatternId;
  readonly taskClass: string;
  readonly cost: { rounds: number; agents: number; verifyTokens: number };
  readonly success: boolean;
  readonly userAccepted: boolean;
  readonly finishedAt: string;
}

export interface EscalationSignal {
  readonly kind: "repeated_failure" | "context_bloat" | "stall" | "verification_gap";
  readonly detail: string;
}