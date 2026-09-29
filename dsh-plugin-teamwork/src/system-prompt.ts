/**
 * system-prompt.ts — Injects the routing rules (decision matrix + do-not rules)
 * into the agent's assembled prompt, plus a live `teamwork_mode` variable.
 *
 * This is the L2 soft-router substrate: the top agent sees the rules and calls
 * `teamwork_router` at the start of complex tasks. The rules TEXT is the same
 * audit surface as the plugin README's decision matrix — keep them in sync.
 */

import type { SystemPromptService, TeamContext } from "./types/dsh.js";
import type { RouterMode } from "./types/contracts.js";
import { ROUTER_RULES_TEXT } from "./router.js";

export function registerRouterSection(
  ctx: TeamContext,
  modeOf: () => RouterMode,
): () => void {
  const sp = ctx.get<SystemPromptService>("systemPrompt");
  if (!sp) return () => undefined;

  const disposers: Array<() => void> = [];

  disposers.push(
    sp.section({
      name: "teamwork:router-rules",
      order: 800, // after persona, before closing instructions
      content: [
        "## Teamwork router rules",
        ROUTER_RULES_TEXT,
        `Current router mode: ${modeOf()}`,
        "When the rules require it, call `teamwork_router` with structured fields.",
      ].join("\n"),
    }),
  );

  disposers.push(
    sp.variable("teamwork_mode", () => modeOf()),
  );

  return () => disposers.forEach((d) => d());
}