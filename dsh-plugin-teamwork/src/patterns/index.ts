/**
 * patterns/index.ts — Five declarative pattern specifications + the L1 hard
 * router rule table.
 *
 * A pattern is DATA, not code ("orchestration logic is decoupled from agent
 * descriptions"): the engine reads it and instantiates roles/gates over the
 * official agentTeams service. This keeps adversarial mechanisms portable
 * across domains without modification.
 */

import type { GateSpec, PatternId, PatternSpec, RoleSpec, VerifyTier } from "../types/contracts.js";
import { DEFAULT_BUDGET } from "../types/contracts.js";

/* ------------------------------------------------------------------ */
/* Shared role prompts                                                 */
/* ------------------------------------------------------------------ */

const EXPLORER = (label: string): RoleSpec => ({
  name: `${label.toLowerCase()}-explorer`,
  description: `Generates diverse candidate ${label} strategies in parallel.`,
  promptTemplate:
    "You are an Explorer. Produce diverse, independent candidate strategies for the objective. Be concrete; each candidate must stand alone. Do not critique — generate.",
  context: "fresh",
  providerTier: "mixed",
});

const FALSIFIER = (pair: string, label: string): RoleSpec => ({
  name: `${label.toLowerCase()}-falsifier`,
  description: `Adversarially attacks every candidate ${label} strategy; paired with each candidate.`,
  promptTemplate:
    "You are a Falsifier. Your sole job is to BREAK the given candidate. Find the flaw that would kill it if pushed deep. Return the objection with the specific step that fails.",
  context: "fresh",
  providerTier: "pro",
  adversarialPairOf: pair,
});

const WORKER = (label: string): RoleSpec => ({
  name: `${label.toLowerCase()}-worker`,
  description: `Implements one isolated branch of the ${label} solution in its own write scope.`,
  promptTemplate:
    "You are a Worker. Implement exactly your assigned subproblem inside your own file scope. Never touch files outside your writeScopes. Write local tests that can be run deterministically.",
  context: "fresh",
  providerTier: "flash",
  toolsGranted: ["bash", "fs"],
});

const CRITIC = (label: string): RoleSpec => ({
  name: `${label.toLowerCase()}-critic`,
  description: `Independent reviewer; works on ANONYMIZED candidates only.`,
  promptTemplate:
    "You are a Critic. Review the candidate (author anonymized on purpose). Judge correctness, completeness, robustness, interface conformance, style. Request concrete revisions.",
  context: "fresh",
  providerTier: "pro",
  blind: true,
});

const VERIFIER = (label: string): RoleSpec => ({
  name: `${label.toLowerCase()}-verifier`,
  description: `Independent auditor: builds/tests and must confirm real command output (no mocked passes).`,
  promptTemplate:
    "You are a Verifier — an INDEPENDENT auditor. Run the deterministic checks; confirm tests genuinely ran against real output. Never accept mocked or skipped passes. Produce an evidenceRef for every verdict.",
  context: "fresh",
  providerTier: "pro",
});

const SYNTHESIZER = (label: string): RoleSpec => ({
  name: `${label.toLowerCase()}-synthesizer`,
  description: `Reads a SAMPLE of candidates plus their critiques and produces an improved solution.`,
  promptTemplate:
    "You are a Synthesizer. Read the sampled candidates and their attached objections. Produce one improved solution that preserves the useful ideas of broken routes and repairs the objections.",
  context: "fork",
  providerTier: "pro",
});

/* ------------------------------------------------------------------ */
/* Common gate chains                                                  */
/* ------------------------------------------------------------------ */

const STANDARD_GATES = (): readonly GateSpec[] => [
  {
    stage: "falsify",
    verifierKind: "llm_heuristic",
    verifyTier: "cheap",
    failAction: "revise",
    description: "Adversarial break attempt on each candidate before it advances.",
  },
  {
    stage: "critic",
    verifierKind: "llm_heuristic",
    verifyTier: "medium",
    failAction: "revise",
    description: "Anonymized quality review; requests revisions (Ralph loop locally).",
  },
  {
    stage: "verify",
    verifierKind: "deterministic",
    verifyTier: "expensive",
    failAction: "reset",
    description: "Deterministic verification (tests/benchmarks/oracle). Acceptance gate.",
  },
  {
    stage: "success-audit",
    verifierKind: "deterministic",
    verifyTier: "expensive",
    failAction: "reject",
    description: "End-to-end final audit by the Success Auditor before human accept.",
  },
];

/* ------------------------------------------------------------------ */
/* The five patterns                                                   */
/* ------------------------------------------------------------------ */

export const PATTERNS: readonly PatternSpec[] = [
  {
    id: "iterative_coding",
    name: "Iterative Coding",
    description:
      "Non-decomposable problems solved through a tight implement→critic→verify→refine loop.",
    when: {
      keywords: ["refactor", "migrate", "bug", "feature", "implement", "rewrite"],
      doNotKeywords: ["keep it small", "small fix", "tiny", "single line", "typo"],
    },
    roles: [EXPLORER("Implementation"), CRITIC("Implementation"), VERIFIER("Implementation")],
    gates: [
      {
        stage: "critic",
        verifierKind: "llm_heuristic",
        verifyTier: "medium",
        failAction: "revise",
        description: "Anonymized code review before verification.",
      },
      {
        stage: "verify",
        verifierKind: "deterministic",
        verifyTier: "expensive",
        failAction: "revise",
        description: "Deterministic test run is the acceptance gate.",
      },
      {
        stage: "success-audit",
        verifierKind: "deterministic",
        verifyTier: "expensive",
        failAction: "reject",
        description: "End-to-end audit before human accept.",
      },
    ],
    budget: { ...DEFAULT_BUDGET, maxAgents: 3, maxRounds: 3 },
    integrityDefault: "development",
  },
  {
    id: "distributed_coding",
    name: "Distributed Coding",
    description:
      "Decomposable engineering tasks that fan out across parallel workers, each with its own write scope and blocker-driven dependencies.",
    when: {
      keywords: [
        "across files",
        "many files",
        "dozens of files",
        "sdk",
        "migration",
        "refactor across",
        "monorepo",
        "multi-file",
        "library",
      ],
      doNotKeywords: ["single file", "one file", "small change"],
      workspaceHints: ["many_files", "test_suite_present"],
    },
    roles: [
      EXPLORER("Design"),
      WORKER("Implementation"),
      CRITIC("Implementation"),
      VERIFIER("Implementation"),
      SYNTHESIZER("Implementation"),
    ],
    gates: STANDARD_GATES(),
    budget: { ...DEFAULT_BUDGET, maxAgents: 6, maxRounds: 4 },
    integrityDefault: "demo",
  },
  {
    id: "long_proof",
    name: "Long Proof",
    description:
      "Open-ended mathematics / TCS: competitive strategy search, per-subproblem tournament networks, strategy-level falsification before proof writing.",
    when: {
      keywords: ["prove", "theorem", "lemma", "conjecture", "bound", "lower bound", "proof"],
      doNotKeywords: ["implement", "refactor", "migrate", "bug fix"],
    },
    roles: [
      EXPLORER("Strategy"),
      FALSIFIER("strategy-explorer", "Strategy"),
      SYNTHESIZER("Strategy"),
      VERIFIER("Proof"),
    ],
    gates: [
      {
        stage: "falsify",
        verifierKind: "llm_heuristic",
        verifyTier: "cheap",
        failAction: "re-explore",
        description: "Every strategy is paired with a falsifier before it can advance.",
      },
      {
        stage: "verify",
        verifierKind: "deterministic",
        verifyTier: "expensive",
        failAction: "reset",
        description: "Acceptance gate: formal tooling / counterexample search ONLY.",
      },
      {
        stage: "success-audit",
        verifierKind: "deterministic",
        verifyTier: "expensive",
        failAction: "reject",
        description: "Final human/formal sign-off.",
      },
    ],
    budget: { ...DEFAULT_BUDGET, maxAgents: 10, maxRounds: 8 },
    integrityDefault: "benchmark",
  },
  {
    id: "self_verification",
    name: "Self-Verification",
    description:
      "Depth-first mathematical reasoning with rigorous self-checking at every step (generate → verify → revise loop).",
    when: {
      keywords: ["derive", "verify", "reasoning", "step-by-step", "math"],
      doNotKeywords: ["code", "implement", "refactor"],
    },
    roles: [EXPLORER("Reasoning"), CRITIC("Reasoning"), VERIFIER("Reasoning")],
    gates: [
      {
        stage: "critic",
        verifierKind: "llm_heuristic",
        verifyTier: "cheap",
        failAction: "revise",
        description: "Every derivation step is checked before proceeding (depth-first).",
      },
      {
        stage: "verify",
        verifierKind: "deterministic",
        verifyTier: "medium",
        failAction: "revise",
        description: "Each intermediate claim cross-checked (compute/formal).",
      },
    ],
    budget: { ...DEFAULT_BUDGET, maxAgents: 2, maxRounds: 6 },
    integrityDefault: "benchmark",
  },
  {
    id: "document_review",
    name: "Document Review",
    description:
      "Structured analysis and critique of papers / RFCs / design docs: segment → parallel review → synthesis.",
    when: {
      keywords: ["review this paper", "critique", "review this", "rfc", "design doc", "read this paper"],
      doNotKeywords: ["implement", "refactor", "prove"],
    },
    roles: [
      {
        name: "doc-segmenter",
        description: "Splits the document into reviewable segments.",
        promptTemplate:
          "You are a Segmenter. Split the document into clearly bounded segments, each with its claim and dependencies.",
        context: "fresh",
        providerTier: "flash",
      },
      CRITIC("Segment"),
      SYNTHESIZER("Segments"),
      VERIFIER("Synthesis"),
    ],
    gates: [
      {
        stage: "critic",
        verifierKind: "llm_heuristic",
        verifyTier: "cheap",
        failAction: "revise",
        description: "Per-segment anonymous critique.",
      },
      {
        stage: "verify",
        verifierKind: "deterministic",
        verifyTier: "medium",
        failAction: "revise",
        description: "Cross-check claims against quoted sources / computations.",
      },
    ],
    budget: { ...DEFAULT_BUDGET, maxAgents: 4, maxRounds: 3 },
    integrityDefault: "development",
  },
];

export function getPattern(id: PatternId): PatternSpec | undefined {
  return PATTERNS.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ */
/* L1 hard router rule table + analyzer                                */
/* ------------------------------------------------------------------ */

export interface HardHint {
  readonly workspaceFiles?: number;
  readonly hasTests?: boolean;
}

export interface HardAnalysis {
  readonly patternId?: PatternId;
  readonly confidence: number;
  readonly reason: string;
}

const LOWERCASE = (s: string): string => s.toLowerCase();

/**
 * L1 deterministic prefilter. Runs BEFORE the model sees the task (zero LLM
 * cost). do-not keywords have strictly higher priority than hit keywords —
 * this is the first anti-over-trigger gate.
 */
export function analyzePrompt(
  prompt: string,
  hints: HardHint = {},
  accept = 0.85,
): HardAnalysis {
  const text = LOWERCASE(prompt);

  // do-not rules first — decisive.
  for (const pattern of PATTERNS) {
    const hit = pattern.when.keywords.some((k) => text.includes(LOWERCASE(k)));
    if (!hit) continue;
    const blocked = pattern.when.doNotKeywords.some((k) => text.includes(LOWERCASE(k)));
    if (blocked) {
      return {
        confidence: 0,
        reason: `do-not rule of ${pattern.id} matched ("${pattern.when.doNotKeywords
          .filter((k) => text.includes(LOWERCASE(k)))
          .join(" / ")}"); task is instantly verifiable or non-classifiable — keep single-agent.`,
      };
    }
  }

  // hit scoring
  const scores = PATTERNS.map((p) => {
    let score = p.when.keywords.filter((k) => text.includes(LOWERCASE(k))).length;
    for (const hint of p.when.workspaceHints ?? []) {
      if (hint === "many_files" && (hints.workspaceFiles ?? 0) >= 8) score += 2;
      if (hint === "test_suite_present" && hints.hasTests) score += 2;
    }
    return { id: p.id, score };
  }).sort((a, b) => b.score - a.score);

  const top = scores[0];
  if (!top || top.score === 0) {
    return { confidence: 0, reason: "no pattern keywords matched — single-agent path." };
  }
  const maxScore = top.score;
  const confidence = Math.min(0.99, 0.5 + maxScore * 0.12);
  return {
    patternId: top.id,
    confidence,
    reason: `L1 keywords matched pattern ${top.id} with score ${maxScore}.`,
  };
}

export const asBudget = (p: PatternSpec): PatternSpec["budget"] => p.budget;
export const hasVerifyTier = (gates: readonly GateSpec[], tier: VerifyTier): boolean =>
  gates.some((g) => g.verifyTier === tier);