/**
 * gates.ts — Four-tier verification gates + integrity modes + blind critique.
 *
 * falsify → critic → verify → success-audit.
 * - `falsify` / `critic` are heuristic (LLM) tiers with blind (anonymized)
 *   candidates and lenient thresholds.
 * - `verify` / `success-audit` are deterministic tiers — the ONLY acceptance gates.
 *
 * Integrity modes encode which shortcuts are off-limits; `benchmark` is the
 * strictest (fully independent, from-scratch, standard library only, no reading
 * test sources to reverse-engineer expected behavior).
 */

import type { IntegrityMode } from "./types/contracts.js";
import type { GateSpec } from "./types/contracts.js";
import { buildProvenance, type VerifierRegistry, type VerificationOutcome } from "./verify.js";

/* ------------------------------------------------------------------ */
/* Integrity modes                                                     */
/* ------------------------------------------------------------------ */

export interface IntegrityPolicy {
  readonly mode: IntegrityMode;
  readonly prohibited: readonly string[];
}

export function integrityPolicy(mode: IntegrityMode): IntegrityPolicy {
  switch (mode) {
    case "benchmark":
      return {
        mode,
        prohibited: [
          "copy_core_from_open_source",
          "delegate_core_to_external_tools",
          "read_test_source_to_reverse_engineer",
          "mock_or_skip_tests",
          "use_non_stdlib_libraries",
        ],
      };
    case "demo":
      return {
        mode,
        prohibited: [
          "copy_core_from_open_source",
          "delegate_core_to_external_tools",
          "read_test_source_to_reverse_engineer",
        ],
      };
    default:
      return { mode, prohibited: ["mock_or_skip_tests", "fabricate_output"] };
  }
}

/** Assert a candidate's self-report does not violate the integrity policy. */
export function assertIntegrity(policy: IntegrityPolicy, selfReport: readonly string[]): string[] {
  return policy.prohibited.filter((p) => selfReport.includes(p));
}

/* ------------------------------------------------------------------ */
/* Blind critique (anonymization)                                      */
/* ------------------------------------------------------------------ */

/**
 * Strip authorship markers from a candidate so a Critic judges the work, not
 * the reputation/agreement pressure. This is the structural fix for
 * "agents agreeing with each other's early mistakes".
 */
export function anonymize(candidate: string, authorName: string): string {
  const redacted = candidate
    .split(authorName)
    .join("<ANONYMOUS>");
  return `[blind review — author anonymized]\n${redacted}`;
}

/* ------------------------------------------------------------------ */
/* Gate runner                                                         */
/* ------------------------------------------------------------------ */

export interface GateContext {
  readonly campaignId: string;
  readonly integrity: IntegrityPolicy;
  readonly verifiers: VerifierRegistry;
  /** Heuristic tier function (LLM critic/falsifier). Pluggable at runtime. */
  readonly heuristic: (candidate: string, gate: GateSpec) => Promise<{
    passed: boolean;
    objections: readonly string[];
    evidenceRef: string;
  }>;
}

export interface GateResult {
  readonly gate: GateSpec;
  readonly passed: boolean;
  readonly objection?: string;
  readonly evidenceRef?: string;
}

export interface GateVerdict {
  readonly results: readonly GateResult[];
  readonly passed: boolean;
  /** If failed: which gate and what failAction to take. */
  readonly failedGate?: GateResult;
}

export function buildGateVerdict(results: readonly GateResult[]): GateVerdict {
  const failed = results.find((r) => !r.passed);
  return {
    results,
    passed: !failed,
    failedGate: failed,
  };
}

/**
 * Run one gate of the pipeline. Deterministic gates act as acceptance gates;
 * heuristic gates are lenient: a heuristic failure returns objections for the
 * revise loop instead of killing the candidate.
 */
export async function runGate(
  ctx: GateContext,
  gate: GateSpec,
  candidate: string,
): Promise<GateResult> {
  const at = new Date().toISOString();

  if (gate.verifierKind === "deterministic") {
    const adapter = ctx.verifiers.get(gate.verifyTier);
    if (!adapter) {
      // No deterministic verifier wired: treat as metadata gap, not pass.
      return { gate, passed: false, objection: `no deterministic verifier for tier ${gate.verifyTier}` };
    }
    const outcome: VerificationOutcome = await adapter.run(candidate);
    const provenance = buildProvenance({
      candidateId: ctx.campaignId,
      verifierId: adapter.id,
      evidenceRef: outcome.evidenceRef,
      verifierKind: "deterministic",
      at,
    });
    return {
      gate,
      passed: outcome.passed,
      evidenceRef: provenance.signature,
      objection: outcome.passed ? undefined : outcome.log.slice(0, 500),
    };
  }

  // Heuristic tier (falsify / critic): blind + lenient.
  if (gate.stage === "critic") {
    candidate = anonymize(candidate, "<author>"); // engine passes author name
  }
  const verdict = await ctx.heuristic(candidate, gate);
  return {
    gate,
    passed: verdict.passed,
    evidenceRef: verdict.evidenceRef,
    objection: verdict.passed ? undefined : verdict.objections.join("; ").slice(0, 500),
  };
}