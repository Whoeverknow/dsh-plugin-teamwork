/**
 * types/dsh.ts — Minimal structural type stubs of the official DSH services this
 * plugin consumes.
 *
 * ⚠️ BUILD-TIME NOTE: In a real deployment these types are replaced by the actual
 * `@deepseek-ai/dsh-*` peer packages (see package.json). The shapes below mirror
 * the live contract measured via `cordis_inspect_query` (agentTeams) and the
 * documented service seams (storageDomain / systemPrompt / tools / commands /
 * userQuestions / approval). They are intentionally structural so that swapping
 * in the real types is a one-file change.
 */

/* ------------------------------------------------------------------ */
/* agentTeams — official live contract (measured)                      */
/* ------------------------------------------------------------------ */

export type SessionId = string & { readonly __session?: never };
export type TeamId = string & { readonly __team?: never };
export type TeamTaskId = string & { readonly __task?: never };
export type TeamMessageId = string & { readonly __message?: never };

export interface ContentBlock {
  readonly type: "text";
  readonly text: string;
}

export type TeamRole = "lead" | "teammate";
export type TeamMemberStatus = "running" | "inactive" | "provisioning" | "failed";
export type TeamTaskStatus = "pending" | "in_progress" | "completed" | "deleted";
export type TeamTaskAction =
  | "claim"
  | "release"
  | "edit"
  | "set_dependencies"
  | "complete"
  | "reopen"
  | "reassign"
  | "delete";

export interface Agent {
  readonly id: SessionId;
}

export interface TeamMembership {
  readonly root: Agent;
  readonly id: TeamId;
  readonly role: TeamRole;
  readonly name: string;
}

export interface TeamMemberView {
  readonly id: SessionId;
  readonly name: string;
  readonly role: TeamRole;
  readonly status: TeamMemberStatus;
  readonly description?: string;
  readonly provider?: string;
  readonly context?: "fresh" | "fork";
  readonly model?: string;
  readonly diagnostics: readonly string[];
}

export interface SpawnTeammateRequest {
  readonly name: string;
  readonly description: string;
  readonly prompt: readonly ContentBlock[];
  readonly context: "fresh" | "fork";
  readonly provider: string;
  readonly signal: AbortSignal;
}

export interface SpawnTeammateResult {
  readonly member: TeamMemberView;
}

export interface SendTeamMessageRequest {
  readonly target: string;
  readonly content: readonly ContentBlock[];
  readonly signal: AbortSignal;
}

export interface SendTeamMessageResult {
  readonly messageId: TeamMessageId;
  readonly status: "accepted" | "queued";
}

export interface CreateTeamTaskRequest {
  readonly subject: string;
  readonly description: string;
  readonly blockedBy?: readonly TeamTaskId[];
  readonly writeScopes?: readonly string[];
}

export interface TeamTaskView {
  readonly id: TeamTaskId;
  readonly revision: number;
  readonly subject: string;
  readonly description: string;
  readonly status: TeamTaskStatus;
  readonly blockedBy: readonly TeamTaskId[];
  readonly writeScopes: readonly string[];
  readonly ownerName?: string;
  readonly ready: boolean;
  readonly writeScopeWarnings: readonly string[];
}

export interface UpdateTeamTaskRequest {
  readonly taskId: TeamTaskId;
  readonly expectedRevision: number;
  readonly action: TeamTaskAction;
  readonly subject?: string;
  readonly description?: string;
  readonly blockedBy?: readonly TeamTaskId[];
  readonly writeScopes?: readonly string[];
  readonly owner?: string;
}

/** Durable per-campaign metadata persisted as task descriptions (see engine). */
export interface CampaignTaskMeta extends Record<string, unknown> {
  readonly campaignId: string;
  readonly risk: number; // 0..1 failure impact × probability
  readonly verifyCostTier: "cheap" | "medium" | "expensive";
  readonly evidenceRefs?: readonly string[];
  readonly blind?: boolean; // anonymized candidates
}

export interface TeamWaitResult {
  readonly timedOut: boolean;
}

export interface AgentTeamsService {
  membership(agent: Agent): TeamMembership;
  listMembers(agent: Agent): TeamMemberView[];
  spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>;
  sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>;
  createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>;
  getTask(caller: Agent, id: TeamTaskId): TeamTaskView;
  listTasks(caller: Agent): TeamTaskView[];
  updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>;
  waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>;
  interrupt(caller: Agent, targetName: string): { previousStatus: "running" | "inactive" };
  tryMembership(agent: Agent): TeamMembership | undefined;
}

/* ------------------------------------------------------------------ */
/* storageDomain — durable key/value domains (four memory regions)     */
/* ------------------------------------------------------------------ */

export interface Domain {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(prefix?: string): Promise<Array<{ key: string; value: T }>>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface StorageDomainService {
  open(name: string): Promise<Domain>;
  get(name: string): Domain | undefined;
}

/* ------------------------------------------------------------------ */
/* tools / systemPrompt / commands / userQuestions / approval / goals  */
/* ------------------------------------------------------------------ */

export interface ToolSchema {
  /** Plain-object schema descriptor or schemastery/zod schema; bound at build. */
  readonly [key: string]: unknown;
}

export interface ToolExecution<TInput = Record<string, unknown>> {
  readonly agent: Agent;
  readonly request: TInput;
  readonly signal: AbortSignal;
}

export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly input: ToolSchema;
  readonly handler: (exec: ToolExecution<TInput>) => Promise<TOutput> | TOutput;
}

export interface ToolsService {
  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): () => void;
}

export interface PromptSection {
  readonly name: string;
  readonly order?: number;
  readonly content?: string;
}

export interface SystemPromptService {
  section(section: PromptSection): () => void;
  variable(name: string, provider: (ctx: unknown) => string | undefined): () => void;
  tools(provider: (context: unknown) => { tools: readonly ToolDefinition[] }): () => void;
  context(context: { name: string; order?: number; content?: string }): () => void;
}

export interface CommandDefinition {
  readonly name: string;
  readonly description?: string;
  readonly handler: (exec: {
    readonly agent: Agent;
    readonly line: string;
    readonly signal: AbortSignal;
  }) => Promise<CommandExecution>;
}

export interface CommandExecution {
  readonly hint?: string;
  readonly messages?: readonly unknown[];
}

export interface CommandsService {
  register(definition: CommandDefinition): () => void;
}

export interface AskUserQuestionRequest {
  readonly question: string;
  readonly options?: readonly { label: string; value: string }[];
}

export interface AskUserQuestionAnswer {
  readonly answer?: string;
  readonly optionId?: string;
}

export interface UserQuestionsService {
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>;
}

export interface ApprovalRequest {
  readonly scope: string;
  readonly description: string;
  readonly action: string;
}

export interface ApprovalOutcome {
  readonly granted: boolean;
  readonly reason?: string;
}

export interface ApprovalService {
  request(req: ApprovalRequest): Promise<ApprovalOutcome>;
}

export interface GoalService {
  create(agent: Agent, request: { objective: string }): unknown;
  complete(agent: Agent, ref: unknown): unknown;
}

export interface InvariantsService {
  register(description: string, check: (ctx: unknown) => boolean | Promise<boolean>): () => void;
}

/* ------------------------------------------------------------------ */
/* The plugin's context: a minimal view over a Cordis ctx              */
/* ------------------------------------------------------------------ */

export interface TeamContext {
  /** Cordis-style optional service access. Returns undefined when absent. */
  get<T>(key: string): T | undefined;
  /** e.g. ctx.logger — minimal stand-in. */
  readonly logger: { error(msg: string): void };
}