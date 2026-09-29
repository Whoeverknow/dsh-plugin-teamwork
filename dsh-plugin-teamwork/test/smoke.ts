/**
 * test/smoke.ts — Pure-logic smoke test (runs on Node ≥23.6 type stripping).
 * Covers: L1 hard router (hit / do-not priority / workspace hints), provenance
 * signature round-trip, integrity modes, blind critique, tiered verification
 * funnel, and pattern registry invariants.
 *
 * Run: node test/smoke.ts
 */

import assert from "node:assert/strict";
import { analyzePrompt, getPattern, PATTERNS } from "../src/patterns/index.js";
import {
  buildProvenance,
  createTieredPlan,
  createVerifierRegistry,
  hashString,
  verifyProvenance,
  type VerificationOutcome,
} from "../src/verify.js";
import {
  anonymize,
  assertIntegrity,
  integrityPolicy,
  runGate,
  type GateContext,
} from "../src/gates.js";

let passed = 0;
const ok = (name: string): void => {
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ---- L1 hard router ---- */
{
  const r1 = analyzePrompt("prove the conjecture and establish a lower bound for the sparse case");
  assert.equal(r1.patternId, "long_proof", "keyword hits should select long_proof");
  assert.ok((r1.confidence ?? 0) >= 0.85, "confidence should clear the L1 accept bar");
  ok("L1: long_proof selected for proof keywords");

  const r2 = analyzePrompt("refactor across dozens of files in the monorepo SDK", {
    workspaceFiles: 20,
    hasTests: true,
  });
  assert.equal(r2.patternId, "distributed_coding", "workspace hints should push distributed_coding");
  ok("L1: distributed_coding with workspace hints");

  const r3 = analyzePrompt("prove the theorem then fix this typo in the implementation");
  assert.equal(r3.patternId, undefined, "do-not keyword must win over hit keyword");
  assert.equal(r3.confidence, 0, "do-not denial must carry zero confidence");
  ok("L1: do-not rules have priority over hit keywords");

  const r4 = analyzePrompt("please write a haiku about the moon");
  assert.equal(r4.patternId, undefined, "non-classifiable must stay single-agent");
  ok("L1: non-classifiable stays single-agent");
}

/* ---- Pattern registry invariants ---- */
{
  assert.equal(PATTERNS.length, 5, "exactly five patterns ship");
  const lp = getPattern("long_proof");
  assert.ok(lp, "long_proof resolves");
  assert.ok(lp.roles.some((r) => r.name === "strategy-falsifier"), "falsifier pairs with explorer");
  assert.ok(lp.gates.some((g) => g.stage === "verify" && g.verifierKind === "deterministic"),
    "acceptance gate is deterministic");
  for (const p of PATTERNS) {
    assert.ok(p.gates.length >= 2, `${p.id} must have ≥2 gates`);
    assert.ok(p.budget.maxAgents >= 1 && p.budget.maxRounds >= 1, `${p.id} budget sane`);
  }
  ok("patterns: five patterns, falsifier pairing, deterministic acceptance, sane budgets");
}

/* ---- Provenance ---- */
{
  assert.equal(hashString("a"), hashString("a"), "hash deterministic");
  assert.notEqual(hashString("a"), hashString("b"), "hash differs for different input");
  const p = buildProvenance({
    candidateId: "c1",
    verifierId: "verifier",
    evidenceRef: "job:123",
    verifierKind: "deterministic",
  });
  assert.equal(verifyProvenance(p), true, "signature verifies round-trip");
  const tampered = { ...p, evidenceRef: "job:999" };
  assert.equal(verifyProvenance(tampered), false, "tampered evidence fails");
  ok("provenance: deterministic signature, tamper detection");
}

/* ---- Integrity modes ---- */
{
  const bench = integrityPolicy("benchmark");
  assert.ok(bench.prohibited.includes("read_test_source_to_reverse_engineer"));
  const violations = assertIntegrity(bench, ["mock_or_skip_tests", "copy_core_from_open_source"]);
  assert.deepEqual([...violations].sort(), ["mock_or_skip_tests", "copy_core_from_open_source"].sort());
  const clean = assertIntegrity(bench, ["reuse_library"]);
  assert.deepEqual(clean, []);
  const dev = integrityPolicy("development");
  assert.ok(dev.prohibited.includes("fabricate_output"), "development blocks fabrication");
  ok("integrity: modes differ per parity; violations detected, clean passes");
}

/* ---- Blind critique ---- */
{
  const blurred = anonymize("Alice's plan: refactor Alice's module", "Alice");
  assert.ok(blurred.includes("<ANONYMOUS>"), "author name redacted");
  assert.ok(!blurred.includes("Alice"), "author name fully gone");
  ok("blind critique: author anonymized");
}

/* ---- Tiered verification funnel ---- */
{
  const outcomes: Record<string, VerificationOutcome> = {};
  const mk = (id: string, tier: "cheap" | "medium" | "expensive", passed: boolean): void => {
    outcomes[id] = { passed, evidenceRef: `ev:${id}`, log: `${id} ${passed ? "ok" : "fail"}` };
  };
  mk("lint", "cheap", true);
  mk("unit", "medium", true);
  mk("bench", "expensive", true);
  const registry = createVerifierRegistry([
    { id: "lint", tier: "cheap", run: async () => outcomes["lint"] },
    { id: "unit", tier: "medium", run: async () => outcomes["unit"] },
    { id: "bench", tier: "expensive", run: async () => outcomes["bench"] },
  ]);
  const plan = createTieredPlan(["cheap", "medium", "expensive"]);
  const result = await plan.run("candidate-1", registry);
  assert.equal(result.passed, true, "all tiers pass → candidate passes");
  assert.equal(result.outcomes.length, 3, "all tiers ran for a survivor");
  ok("funnel: survivor runs cheap→medium→expensive");

  mk("bench", "expensive", false);
  const failed = await plan.run("candidate-2", registry);
  assert.equal(failed.passed, false, "expensive gate failing stops acceptance");
  assert.equal(failed.outcomes.length, 3, "expensive failure still ran all prior tiers");
  ok("funnel: acceptance gate only trustworthy at expensive; failure stops");

  const thin = createVerifierRegistry([
    { id: "lint", tier: "cheap", run: async () => outcomes["lint"] },
  ]);
  const thinPlan = createTieredPlan(["cheap", "medium", "expensive"]);
  const thinResult = await thinPlan.run("candidate-3", thin);
  assert.equal(thinResult.passed, false, "missing deterministic verifier must NOT pass acceptance");
  ok("funnel: absent deterministic verifier ⟹ no acceptance (no false pass)");
}

/* ---- Gate runner (heuristic + deterministic paths) ---- */
{
  const ctx: GateContext = {
    campaignId: "c-smoke",
    integrity: integrityPolicy("benchmark"),
    verifiers: createVerifierRegistry([]),
    heuristic: async () => ({ passed: true, objections: [], evidenceRef: "ev:heuristic" }),
  };
  const criticGate = getPattern("iterative_coding")!.gates[0]!;
  const r = await runGate(ctx, criticGate, "candidate");
  assert.equal(r.gate.stage, "critic");
  ok("gate runner: heuristic gate executes");

  const detGate = {
    stage: "verify" as const,
    verifierKind: "deterministic" as const,
    verifyTier: "expensive" as const,
    failAction: "reset" as const,
    description: "no adapter wired",
  };
  const nd = await runGate(ctx, detGate, "candidate");
  assert.equal(nd.passed, false, "deterministic gate with missing adapter refuses to pass");
  ok("gate runner: deterministic gate never false-passes without an adapter");
}

/* ---- End-to-end: engine over fake agentTeams + fake storageDomain ---- */
import {
  DEFAULT_BUDGET,
  DEFAULT_THRESHOLDS,
  type CampaignRequest,
} from "../src/types/contracts.js";
import type {
  Agent,
  AgentTeamsService,
  CreateTeamTaskRequest,
  Domain,
  SendTeamMessageRequest,
  SpawnTeammateRequest,
  StorageDomainService,
  TeamMemberView,
  TeamTaskId,
  TeamTaskView,
  UpdateTeamTaskRequest,
} from "../src/types/dsh.js";
import { TeamworkEngine } from "../src/engine.js";
import { MemoryHub } from "../src/memory.js";

class FakeDomain implements Domain {
  readonly #m = new Map<string, string>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.#m.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async list<T>(prefix = ""): Promise<Array<{ key: string; value: T }>> {
    return [...this.#m.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => ({ key: k, value: JSON.parse(v) as T }));
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.#m.set(key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    this.#m.delete(key);
  }
}

class FakeStorage implements StorageDomainService {
  readonly #domains = new Map<string, FakeDomain>();
  async open(name: string): Promise<Domain> {
    let d = this.#domains.get(name);
    if (!d) {
      d = new FakeDomain();
      this.#domains.set(name, d);
    }
    return d;
  }
  get(name: string): Domain | undefined {
    return this.#domains.get(name);
  }
}

class FakeTeams implements AgentTeamsService {
  members: TeamMemberView[] = [];
  tasks: TeamTaskView[] = [];
  nextTask = 1;
  waitCalls = 0;
  /** When set, all tasks auto-complete after the Nth waitForChange (simulated workers). */
  waitsBeforeComplete?: number;

  membership(agent: Agent) {
    return { root: agent, id: "t1" as never, role: "lead" as const, name: "lead" };
  }
  tryMembership(agent: Agent) {
    return this.membership(agent);
  }
  listMembers() {
    return [...this.members];
  }
  async spawnTeammate(_caller: Agent, req: SpawnTeammateRequest) {
    const member: TeamMemberView = {
      id: `s${this.members.length + 1}` as never,
      name: req.name,
      role: "teammate",
      status: "running",
      description: req.description,
      context: req.context,
      provider: req.provider,
    };
    this.members.push(member);
    return { member };
  }
  async createTask(_caller: Agent, req: CreateTeamTaskRequest) {
    const task: TeamTaskView = {
      id: `tk${this.nextTask += 1}` as TeamTaskId,
      revision: 1,
      subject: req.subject,
      description: req.description,
      status: "pending",
      blockedBy: req.blockedBy ?? [],
      writeScopes: req.writeScopes ?? [],
      ready: (req.blockedBy ?? []).length === 0,
      writeScopeWarnings: [],
    };
    this.tasks.push(task);
    return task;
  }
  getTask(_caller: Agent, id: TeamTaskId) {
    return this.tasks.find((t) => t.id === id)!;
  }
  listTasks() {
    return [...this.tasks];
  }
  async updateTask(_caller: Agent, req: UpdateTeamTaskRequest) {
    const idx = this.tasks.findIndex((t) => t.id === req.taskId);
    const t = this.tasks[idx]!;
    if (req.expectedRevision !== t.revision) throw new Error("CAS mismatch");
    const next: TeamTaskView = { ...t, revision: t.revision + 1 };
    if (req.action === "complete") next.status = "completed";
    if (req.action === "claim") {
      next.status = "in_progress";
      next.ownerName = req.owner;
    }
    if (req.action === "release") {
      next.status = "pending";
      next.ownerName = undefined;
    }
    if (req.action === "reopen") next.status = "pending";
    if (req.action === "set_dependencies") next.blockedBy = req.blockedBy ?? next.blockedBy;
    if (req.action === "reassign" && req.owner) next.ownerName = req.owner;
    this.tasks[idx] = next;
    return next;
  }
  async waitForChange() {
    this.waitCalls += 1;
    if (this.waitsBeforeComplete !== undefined && this.waitCalls >= this.waitsBeforeComplete) {
      this.tasks = this.tasks.map((t) => ({ ...t, status: "completed" as const }));
    }
    return { timedOut: false };
  }
  interrupt() {
    return { previousStatus: "running" as const };
  }
  async sendMessage(_caller: Agent, _req: SendTeamMessageRequest) {
    return { messageId: "m1" as never, status: "accepted" as const };
  }
}

{
  const teams = new FakeTeams();
  const storage = new FakeStorage();
  const memory = await MemoryHub.open(storage);
  const verifiers = createVerifierRegistry([
    { id: "lint", tier: "cheap", run: async () => ({ passed: true, evidenceRef: "ev:lint", log: "ok" }) },
    { id: "bench", tier: "expensive", run: async () => ({ passed: true, evidenceRef: "ev:bench", log: "ok" }) },
  ]);
  const engine = new TeamworkEngine(teams, memory, {
    budgetCeiling: DEFAULT_BUDGET,
    thresholds: DEFAULT_THRESHOLDS,
    verifiers,
    heuristic: async () => ({ passed: true, objections: [], evidenceRef: "ev:h" }),
    onCheckpoint: async () => true,
    logger: { error: () => undefined },
  });

  /* capBudget never raises the ceiling */
  const capped = engine.capBudget({ ...DEFAULT_BUDGET, maxAgents: 999, maxRounds: 99 });
  assert.equal(capped.maxAgents, DEFAULT_BUDGET.maxAgents, "budget cap enforced");
  assert.equal(capped.maxRounds, DEFAULT_BUDGET.maxRounds, "round cap enforced");
  ok("engine: budget is a ceiling (model cannot raise it)");

  teams.waitsBeforeComplete = 2;
  const pattern = getPattern("long_proof")!;
  const request: CampaignRequest = {
    campaignId: "c-int",
    pattern,
    objective: "prove a test conjecture",
    acceptanceCriteria: ["formal check"],
    integrity: "benchmark",
    budget: pattern.budget,
    lead: { name: "lead", id: "self" },
  };
  const report = await engine.start(request);

  assert.equal(report.status, "completed", "campaign completes when the board closes");
  assert.ok(report.rounds >= 1, "at least one round ran");
  assert.equal(report.members.length, pattern.roles.length, "all role teammates spawned");
  assert.ok(report.verifyTokensSpent > 0, "verification budget accounted");
  assert.ok(
    report.provenance.some((p) => p.verifierKind === "deterministic"),
    "deterministic gate recorded provenance",
  );
  ok("engine: full campaign loop — spawn, gates, provenance, close, report");

  const weights = await memory.banditWeights("prove a test conjecture");
  assert.ok(weights["long_proof"] !== undefined, "battle record feeds bandit weights");
  assert.ok((weights["long_proof"] ?? 1) > 0, "bandit weight positive");
  ok("engine: battle record written; bandit learns from completed campaign");
}

/* ---- Router: modes, do-not, budget ceiling ---- */
import { TeamworkRouter } from "../src/router.js";
{
  const ask = new TeamworkRouter({
    mode: "ask",
    budgetCeiling: DEFAULT_BUDGET,
    bandit: async () => ({}),
  });
  const denied = await ask.decide("fix this typo in the implementation", {});
  assert.equal(denied.proceed, false, "do-not denial blocks escalation");
  ok("router: do-not denial blocks escalation");

  const decided = await ask.decide(
    "prove the conjecture with a lower bound",
    {},
    {
      shouldUseTeam: true,
      patternId: "long_proof",
      reason: "open problem",
      requestedBudget: { maxAgents: 5, maxRounds: 3 },
    },
  );
  assert.equal(decided.proceed, true, "hit pattern proceeds");
  assert.equal(decided.needsApproval, true, "ask mode requires approval");
  assert.equal(decided.budget.maxAgents, 5, "requested budget honored within ceiling");
  assert.equal(decided.budget.maxRounds, 3, "requested rounds honored within ceiling");
  ok("router: ask mode + partial budget request merged");

  const auto = new TeamworkRouter({
    mode: "auto",
    budgetCeiling: DEFAULT_BUDGET,
    bandit: async () => ({}),
  });
  const a = await auto.decide(
    "prove the conjecture",
    {},
    {
      shouldUseTeam: true,
      patternId: "long_proof",
      reason: "x",
      requestedBudget: { maxAgents: 999, maxRounds: 999 },
    },
  );
  assert.equal(a.proceed, true, "auto proceeds");
  assert.equal(a.needsApproval, false, "auto skips approval within budget");
  assert.equal(a.budget.maxAgents, DEFAULT_BUDGET.maxAgents, "auto still caps against ceiling");
  ok("router: auto mode caps budget and skips approval within cap");

  const off = new TeamworkRouter({
    mode: "off",
    budgetCeiling: DEFAULT_BUDGET,
    bandit: async () => ({}),
  });
  const o = await off.decide("prove the conjecture", {});
  assert.equal(o.proceed, false, "off mode never triggers");
  ok("router: off mode is manual-only");
}

/* ---- Plugin entry: module-level wiring (apply needs a live ctx) ---- */
{
  const mod = await import("../src/index.js");
  assert.equal(mod.name, "plugin-teamwork", "entry name");
  assert.equal(mod.Config.routerMode, "ask", "default mode is ask");
  assert.equal(mod.inject.length, 5, "five required services injected");
  assert.equal(typeof mod.apply, "function", "apply is exported");
  ok("entry: Config/apply/inject/name export; all modules link at module scope");
}

console.log(`\nAll ${passed} smoke checks passed.`);