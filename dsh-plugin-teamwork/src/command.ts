/**
 * command.ts — /teamwork command: scoping interview → approval gate → engine.
 *
 * Two-phase workflow (from the design):
 *   Phase 1: scope interview (userQuestions, once per session — cached) with
 *            "Specify What, Not How": integrity mode + independent criteria.
 *   Phase 2: approve → engine.start (autonomous execution through the official
 *            agentTeams service; structured handoffs in campaign domains).
 */

import type { ApprovalService, TeamContext, UserQuestionsService } from "./types/dsh.js";
import type { IntegrityMode, PatternId } from "./types/contracts.js";
import { getPattern } from "./patterns/index.js";
import type { TeamworkEngine } from "./engine.js";

export interface CommandDeps {
  readonly engine: TeamworkEngine;
}

/** Scope cache: one interview per session id (anti-interview-fatigue). */
const scopeCache = new Map<string, { integrity: IntegrityMode; criteria: readonly string[] }>();

export interface ParsedLine {
  readonly goal: string;
  readonly pattern?: PatternId;
  readonly mode?: string;
}

export function parseLine(line: string): ParsedLine {
  const rest = line.replace(/^\/teamwork\s+/, "").trim();
  const modeMatch = rest.match(/--mode\s+(\S+)/);
  const patternMatch = rest.match(/--pattern\s+(\S+)/);
  const goal = rest
    .replace(/--mode\s+\S+/, "")
    .replace(/--pattern\s+\S+/, "")
    .trim();
  return {
    goal,
    pattern: patternMatch?.[1] as PatternId | undefined,
    mode: modeMatch?.[1],
  };
}

export async function handleTeamworkCommand(
  ctx: TeamContext,
  deps: CommandDeps,
  line: string,
): Promise<string> {
  const parsed = parseLine(line);
  if (!parsed.goal) return "usage: /teamwork <goal> [--pattern <id>] [--mode ask|auto]";

  const questions = ctx.get<UserQuestionsService>("userQuestions");
  const approval = ctx.get<ApprovalService>("approval");

  /* ----- Phase 1: scoping interview (once per session) ----- */
  let scope = scopeCache.get("session");
  if (!scope) {
    const integrityAnswer = questions
      ? await questions.ask({
          question: "完整性模式？(development=宽松 / demo=中等 / benchmark=最严)",
          options: [
            { label: "development（默认，宽松，仅禁造假与面子工程）", value: "development" },
            { label: "demo（中等，禁抄开源核心/禁读测试源码反推）", value: "demo" },
            { label: "benchmark（最严，独立实现+仅标准库）", value: "benchmark" },
          ],
        })
      : undefined;
    const criteriaAnswer = questions
      ? await questions.ask({
          question:
            "验收标准（独立验证）？例如「测试全绿 + 基准 p95 不劣化 + 全量回归」。留空使用默认。",
        })
      : undefined;
    scope = {
      integrity: (integrityAnswer?.optionId as IntegrityMode | undefined) ?? "development",
      criteria: criteriaAnswer?.answer
        ? criteriaAnswer.answer
            .split(/[;；\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : ["deterministic tests pass", "verified against real command output"],
    };
    scopeCache.set("session", scope);
  }

  const patternId = parsed.pattern ?? "distributed_coding";
  const pattern = getPattern(patternId);
  if (!pattern) {
    return `unknown pattern "${patternId}". available: ${["iterative_coding", "distributed_coding", "long_proof", "self_verification", "document_review"].join(", ")}`;
  }

  /* ----- Phase 2: approval gate then start ----- */
  if (approval) {
    const outcome = await approval.request({
      scope: "teamwork:campaign",
      description: `Start ${pattern.name} campaign on "${parsed.goal}" (integrity=${scope.integrity}, ${pattern.budget.maxAgents} agents max, ${pattern.budget.maxRounds} rounds max).`,
      action: "start_campaign",
    });
    if (!outcome.granted) return "campaign rejected by approval gate.";
  }

  const campaignId = `campaign-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const budget = deps.engine.capBudget(pattern.budget);

  void deps.engine
    .start({
      campaignId,
      pattern,
      objective: parsed.goal,
      acceptanceCriteria: scope.criteria,
      integrity: scope.integrity,
      budget,
      lead: { name: "lead", id: "self" },
    })
    .then((report) => {
      void report; // surfaced through teamwork_status / UI in later phases
    });

  return `campaign ${campaignId} started (${pattern.name}, integrity=${scope.integrity}, budget capped). Use teamwork_status to follow, teamwork_control to steer.`;
}