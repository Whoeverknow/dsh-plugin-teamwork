/**
 * index.ts — Plugin entry. Cordis convention: export { Config, apply, inject, name }.
 *
 * Wiring:
 *   - opens the four memory domains (+ battle log) via storageDomain
 *   - builds the TeamworkEngine over the official agentTeams service
 *   - builds the router (off/ask/auto + budget ceiling + bandit)
 *   - registers the system-prompt section, three tools, and the /teamwork command
 *
 * Non-replacement guarantees (README chapter 1):
 *   - no official tool is overridden or shadowed (we only ADD teamwork_* tools)
 *   - all mutations go through ctx.agentTeams (official CAS + session log)
 *   - removing this plugin restores the exact prior toolset
 */

import type {
  AgentTeamsService,
  ApprovalService,
  CommandsService,
  StorageDomainService,
  SystemPromptService,
  TeamContext,
  ToolsService,
} from "./types/dsh.js";
import {
  DEFAULT_BUDGET,
  DEFAULT_THRESHOLDS,
  type Budget,
  type CampaignState,
  type IntegrityMode,
  type RouterMode,
  type Thresholds,
} from "./types/contracts.js";
import { TeamworkEngine } from "./engine.js";
import { MemoryHub } from "./memory.js";
import { TeamworkRouter } from "./router.js";
import { registerCommand, registerTools, type ToolDeps } from "./tools.js";
import { handleTeamworkCommand } from "./command.js";
import { registerRouterSection } from "./system-prompt.js";
import { createVerifierRegistry, type VerifierAdapter } from "./verify.js";

export const name = "plugin-teamwork";

export interface Config {
  readonly routerMode: RouterMode;
  readonly budgetCeiling: Budget;
  readonly thresholds: Thresholds;
  readonly integrityDefault: IntegrityMode;
  readonly shouldRegisterRouterSection: boolean;
  readonly shouldRegisterTools: boolean;
  readonly shouldRegisterCommand: boolean;
  /** Optional deterministic verifier adapters (cheap/medium/expensive). */
  readonly verifierAdapters?: readonly VerifierAdapter[];
}

export const Config: Config = {
  routerMode: "ask",
  budgetCeiling: DEFAULT_BUDGET,
  thresholds: DEFAULT_THRESHOLDS,
  integrityDefault: "development",
  shouldRegisterRouterSection: true,
  shouldRegisterTools: true,
  shouldRegisterCommand: true,
  verifierAdapters: [],
};

/** Services this plugin requires to be present (hard dependencies). */
export const inject = [
  "agentTeams",
  "storageDomain",
  "tools",
  "systemPrompt",
  "commands",
] as const;

export interface PluginCtx extends TeamContext {
  agentTeams: AgentTeamsService;
  storageDomain: StorageDomainService;
  tools: ToolsService;
  systemPrompt: SystemPromptService;
  commands: CommandsService;
}

export async function apply(ctx: PluginCtx, config: Config): Promise<() => void> {
  const { agentTeams, storageDomain } = ctx;
  const memory = await MemoryHub.open(storageDomain);
  const verifiers = createVerifierRegistry(config.verifierAdapters ?? []);

  const engine = new TeamworkEngine(agentTeams, memory, {
    budgetCeiling: config.budgetCeiling,
    thresholds: config.thresholds,
    verifiers,
    /* Heuristic tier (LLM critic/falsifier) is optional. The default is a
       passthrough; production wires a real critic behind the official `llm`
       service. Deterministic gates remain the only acceptance gates. */
    heuristic: async () => ({
      passed: true,
      objections: [],
      evidenceRef: "heuristic:not-wired",
    }),
    onCheckpoint: async (campaignId, round) => {
      const approval = ctx.get<ApprovalService>("approval");
      if (!approval) return true;
      const outcome = await approval.request({
        scope: "teamwork:checkpoint",
        description: `Checkpoint ${round} of campaign ${campaignId} — continue?`,
        action: "checkpoint",
      });
      return outcome.granted;
    },
    logger: ctx.logger,
  });

  /* Latest campaign state surfaced to teamwork_status. */
  let lastState: CampaignState | undefined;
  {
    const originalStart = engine.start.bind(engine);
    engine.start = (async (request) => {
      const report = await originalStart(request);
      lastState = {
        campaignId: report.campaignId,
        status: report.status,
        rounds: report.rounds,
        members: report.members,
        tasks: report.tasks,
        verifyTokensSpent: report.verifyTokensSpent,
        provenance: report.provenance,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      return report;
    }) as typeof engine.start;
  }

  const router = new TeamworkRouter({
    mode: config.routerMode,
    budgetCeiling: config.budgetCeiling,
    bandit: (taskClass) => memory.banditWeights(taskClass),
  });

  /* Latest campaign state surfaced to teamwork_status (set by the start wrapper). */
  const deps: ToolDeps = {
    router,
    engine,
    memory,
    state: () => lastState,
    control: async (action, opts) => {
      if (action === "interrupt" && opts?.targetName) {
        const agent = opts.agent;
        const prior = agentTeams.interrupt(agent, opts.targetName);
        return { ok: true, note: `interrupted ${opts.targetName} (was ${prior.previousStatus})` };
      }
      return { ok: true, note: `control action ${action} recorded (engine-level)` };
    },
  };

  const disposers: Array<() => void> = [];
  if (config.shouldRegisterRouterSection) {
    disposers.push(registerRouterSection(ctx, () => config.routerMode));
  }
  if (config.shouldRegisterTools) {
    disposers.push(registerTools(ctx, deps));
  }
  if (config.shouldRegisterCommand) {
    disposers.push(registerCommand(ctx, (line) => handleTeamworkCommand(ctx, { engine }, line)));
  }

  return () => disposers.forEach((d) => d());
}