/**
 * tools.ts — The three model-facing tools.
 *
 *   teamwork_router   (L2 soft router): structured decision with a mandatory
 *                     reason even when NOT using a team (anti-over-trigger).
 *   teamwork_status   read-only campaign state (board, members, provenance).
 *   teamwork_control  interrupt / escalate / stop (human control legs).
 *
 * Tool input schemas are plain descriptors here; at build time they bind to
 * the schema library used by the official tools registry (schemastery/zod).
 * The handler contract is unchanged. All mutations go through the official
 * agentTeams service via the wired `control` callback (CAS-protected).
 */

import type { Agent, CommandsService, TeamContext, ToolDefinition, ToolsService } from "./types/dsh.js";
import type { CampaignState } from "./types/contracts.js";
import type { TeamworkEngine } from "./engine.js";
import type { MemoryHub } from "./memory.js";
import type { TeamworkRouter } from "./router.js";

export interface ControlOptions {
  readonly targetName?: string;
  readonly agent: Agent;
}

export interface ToolDeps {
  readonly router: TeamworkRouter;
  readonly engine: TeamworkEngine;
  readonly memory: MemoryHub;
  readonly state: () => CampaignState | undefined;
  readonly control: (
    action: "interrupt" | "escalate" | "stop",
    opts: ControlOptions,
  ) => Promise<{ ok: boolean; note: string }>;
}

const STRING_FIELD = { type: "string" };

/** teamwork_router — declarative, model-visible, structured output. */
export function defineRouterTool(deps: ToolDeps): ToolDefinition {
  return {
    name: "teamwork_router",
    description:
      "Decide whether this task should escalate into a multi-agent Teamwork campaign. " +
      "Call once at the start of complex, open-ended, long-horizon, or decomposable tasks. " +
      "If deciding NOT to use a team, you MUST explain which do-not rule applies (auditable).",
    input: {
      type: "object",
      properties: {
        prompt: { ...STRING_FIELD, description: "the original task text" },
        shouldUseTeam: { type: "boolean", description: "whether to run a campaign" },
        pattern: {
          type: "string",
          enum: ["iterative_coding", "distributed_coding", "long_proof", "self_verification", "document_review"],
        },
        reason: { type: "string", description: "mandatory justification (also when NOT using a team)" },
        maxAgents: { type: "number", description: "requested agent cap (never exceeds config ceiling)" },
        maxRounds: { type: "number", description: "requested round cap (never exceeds config ceiling)" },
      },
      required: ["prompt", "shouldUseTeam", "reason"],
    },
    async handler(exec) {
      const req = exec.request as Record<string, unknown>;
      void deps; // engine/memory/control wired by index.ts; router handles decision
      const shouldUseTeam = req.shouldUseTeam === true;
      const reason = String(req.reason ?? "");
      const outcome = await deps.router.decide(
        String(req.prompt ?? ""),
        {},
        {
          shouldUseTeam,
          patternId: req.pattern as "distributed_coding" | undefined,
          confidence: typeof req.confidence === "number" ? req.confidence : undefined,
          reason,
          requestedBudget:
            typeof req.maxAgents === "number" || typeof req.maxRounds === "number"
              ? {
                  maxAgents: Number(req.maxAgents ?? 1),
                  maxRounds: Number(req.maxRounds ?? 1),
                }
              : undefined,
        },
      );
      return { ...outcome.decision, proceed: outcome.proceed, needsApproval: outcome.needsApproval };
    },
  };
}

/** teamwork_status — read-only campaign visibility. */
export function defineStatusTool(deps: ToolDeps): ToolDefinition {
  return {
    name: "teamwork_status",
    description:
      "Read-only status of the current Teamwork campaign: task board, members, rounds, provenance. Never mutates.",
    input: { type: "object", properties: {}, required: [] },
    async handler() {
      const state = deps.state();
      if (!state) {
        const pitfalls = await deps.memory.listPitfalls();
        return { running: false, note: `no active campaign; ${pitfalls.length} pitfalls on record` };
      }
      return {
        running: true,
        status: state.status,
        rounds: state.rounds,
        members: state.members.map((m) => ({ name: m.name, role: m.role, status: m.status })),
        tasks: state.tasks.map((t) => ({ id: t.id, subject: t.subject, status: t.status, ready: t.ready })),
        verifyTokensSpent: state.verifyTokensSpent,
        provenanceCount: state.provenance.length,
      };
    },
  };
}

/** teamwork_control — human/lead control legs (goes through agentTeams). */
export function defineControlTool(deps: ToolDeps): ToolDefinition {
  return {
    name: "teamwork_control",
    description:
      "Control the running campaign: interrupt a teammate, escalate, or stop. Changes are CAS-protected through the official agentTeams service.",
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["interrupt", "escalate", "stop"] },
        targetName: { type: "string", description: "teammate name for interrupt" },
        reason: { type: "string" },
      },
      required: ["action"],
    },
    async handler(exec) {
      const req = exec.request as Record<string, unknown>;
      const action = req.action as "interrupt" | "escalate" | "stop";
      return deps.control(action, {
        agent: exec.agent,
        targetName: req.targetName ? String(req.targetName) : undefined,
      });
    },
  };
}

/** Register all three tools; returns a disposer. */
export function registerTools(ctx: TeamContext, deps: ToolDeps): () => void {
  const tools = ctx.get<ToolsService>("tools");
  if (!tools) return () => undefined;
  const disposers = [
    tools.register(defineRouterTool(deps)),
    tools.register(defineStatusTool(deps)),
    tools.register(defineControlTool(deps)),
  ];
  return () => disposers.forEach((d) => d());
}

/** Register the /teamwork command (L0 manual entry). */
export function registerCommand(
  ctx: TeamContext,
  handler: (line: string) => Promise<string>,
): () => void {
  const commands = ctx.get<CommandsService>("commands");
  if (!commands) return () => undefined;
  return commands.register({
    name: "teamwork",
    description: "Run a multi-agent Teamwork campaign: /teamwork <goal> [--pattern <id>] [--mode ask|auto]",
    async handler(exec) {
      const hint = await handler(exec.line);
      return { hint };
    },
  });
}