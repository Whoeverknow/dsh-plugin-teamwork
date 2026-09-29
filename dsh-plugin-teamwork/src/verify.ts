/**
 * verify.ts — Deterministic verifier adapters + provenance signatures.
 *
 * Design rule (verification ceiling theorem): team intelligence is bounded by
 * the RELIABILITY of the verifier, not the smartness of the members. So the
 * acceptance gate only trusts `deterministic` verifiers; LLM critique is a
 * cheap heuristic tier (blind critique) used to prune candidates early.
 *
 * noUncheckedIndexedAccess-safe, dependency-free (string hashing only).
 */

import type { VerifierKind, VerifyTier } from "./types/contracts.js";
import type { Provenance } from "./types/contracts.js";

/* ------------------------------------------------------------------ */
/* Dependency-free FNV-1a 32-bit hash (deterministic provenance sig)   */
/* ------------------------------------------------------------------ */

export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ------------------------------------------------------------------ */
/* Deterministic verifier adapters                                     */
/* ------------------------------------------------------------------ */

export interface VerificationOutcome {
  readonly passed: boolean;
  readonly evidenceRef: string; // spill/file/job id the result can be re-checked against
  readonly log: string;
}

export interface VerifierAdapter {
  readonly id: string;
  readonly tier: VerifyTier;
  /** Run one verification of `target`; must produce a re-checkable evidenceRef. */
  run(target: string): Promise<VerificationOutcome>;
}

export interface VerifierRegistry {
  get(tier: VerifyTier): VerifierAdapter | undefined;
  list(): readonly string[];
}

export function createVerifierRegistry(adapters: readonly VerifierAdapter[]): VerifierRegistry {
  const byTier = new Map<VerifyTier, VerifierAdapter>();
  for (const a of adapters) byTier.set(a.tier, a);
  return {
    get: (tier) => byTier.get(tier),
    list: () => adapters.map((a) => a.id),
  };
}

/* ------------------------------------------------------------------ */
/* Tiered verification plan                                            */
/* ------------------------------------------------------------------ */

/**
 * cheap → medium → expensive funnel. `expensive` runs only on survivors;
 * acceptance only trusts `expensive`. cheap gates are lenient ("rather pass
 * than kill" — prevents false-killing real candidates).
 */
export interface VerifyPlan {
  readonly tiers: readonly VerifyTier[];
  run(target: string, registry: VerifierRegistry): Promise<{ tiers: VerifyTier[]; passed: boolean; outcomes: VerificationOutcome[] }>;
}

export function createTieredPlan(tiers: readonly VerifyTier[]): VerifyPlan {
  return {
    tiers,
    async run(target, registry) {
      const outcomes: VerificationOutcome[] = [];
      for (let i = 0; i < tiers.length; i += 1) {
        const tier = tiers[i];
        const adapter = registry.get(tier);
        if (!adapter) {
          /* Missing adapter on the FINAL (acceptance) tier is a hard failure —
             an acceptance gate must never pass vacuously. Missing intermediate
             tiers are skipped (their cost is optional). */
          if (i === tiers.length - 1) {
            outcomes.push({
              passed: false,
              evidenceRef: `missing:${tier}`,
              log: `no deterministic verifier for acceptance tier ${tier}`,
            });
            return { tiers, passed: false, outcomes };
          }
          continue;
        }
        const outcome = await adapter.run(target);
        outcomes.push(outcome);
        if (!outcome.passed) return { tiers, passed: false, outcomes };
      }
      return { tiers, passed: true, outcomes };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Provenance signature                                                */
/* ------------------------------------------------------------------ */

export function buildProvenance(input: {
  readonly candidateId: string;
  readonly verifierId: string;
  readonly evidenceRef: string;
  readonly verifierKind: VerifierKind;
  readonly at?: string;
}): Provenance {
  const at = input.at ?? new Date().toISOString();
  const signature = hashString([input.candidateId, input.verifierId, input.evidenceRef, input.verifierKind].join("|"));
  return { ...input, at, signature };
}

export function verifyProvenance(p: Provenance): boolean {
  const expect = hashString([p.candidateId, p.verifierId, p.evidenceRef, p.verifierKind].join("|"));
  return expect === p.signature;
}