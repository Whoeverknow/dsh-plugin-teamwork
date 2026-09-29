/**
 * memory.ts — Four-domain memory + battle log + bandit weights.
 *
 * pitfalls      (negative knowledge, answer-agnostic, signature-deduped, TTL'd)
 * knowledge     (positive knowledge: proved results, useful observations)
 * attempts      (process knowledge: failed drafts remain as germplasm)
 * evidence      (computational evidence: reproducible numeric results)
 * battle        (campaign records → bandit weights for router learning)
 *
 * Backed by the official storageDomain service (durable, JSON-serializable).
 */

import type { Domain, StorageDomainService } from "./types/dsh.js";
import type { BattleRecord, PatternId } from "./types/contracts.js";
import { hashString } from "./verify.js";

export const DOMAIN_NAMES = {
  pitfalls: "teamwork.pitfalls",
  knowledge: "teamwork.knowledge",
  attempts: "teamwork.attempts",
  evidence: "teamwork.evidence",
  battle: "teamwork.battle",
} as const;

export interface PitfallEntry {
  readonly signature: string;
  readonly verifierId: string;
  readonly round: number;
  readonly text: string;
  readonly createdAt: string;
}

export interface AttemptEntry {
  readonly routeId: string;
  readonly patternId: PatternId;
  readonly candidate: string;
  readonly objections: readonly string[];
  readonly failed: boolean;
  readonly createdAt: string;
}

export class MemoryHub {
  readonly #domains: Readonly<Record<keyof typeof DOMAIN_NAMES, Domain | undefined>>;

  private constructor(domains: Readonly<Record<keyof typeof DOMAIN_NAMES, Domain | undefined>>) {
    this.#domains = domains;
  }

  static async open(storage: StorageDomainService): Promise<MemoryHub> {
    const names = Object.values(DOMAIN_NAMES);
    const opened = await Promise.all(names.map((n) => storage.open(n)));
    const map = {} as Record<keyof typeof DOMAIN_NAMES, Domain>;
    (Object.keys(DOMAIN_NAMES) as Array<keyof typeof DOMAIN_NAMES>).forEach((k, i) => {
      const domain = opened[i];
      if (domain) map[k] = domain;
    });
    return new MemoryHub(map);
  }

  /* ----- pitfalls (negative knowledge) ----- */

  async appendPitfall(
    input: Omit<PitfallEntry, "signature" | "createdAt">,
    ttlMs: number,
  ): Promise<void> {
    const domain = this.#domains.pitfalls;
    if (!domain) return;
    const signature = hashString(`${input.verifierId}|${input.round}|${input.text}`);
    const existing = await domain.get<string | undefined>(`pit:${signature}`);
    if (existing !== undefined) return; // signature-deduped
    await domain.put(`pit:${signature}`, JSON.stringify({ ...input, signature, createdAt: new Date().toISOString() }));
    // TTL housekeeping: best-effort sweep of stale keys.
    await this.#sweepPitfalls(domain, ttlMs);
  }

  async #sweepPitfalls(domain: Domain, ttlMs: number): Promise<void> {
    const cutoff = Date.now() - ttlMs;
    const entries = await domain.list<{ createdAt: string }>("pit:");
    for (const e of entries) {
      try {
        const parsed = typeof e.value === "string" ? (JSON.parse(e.value) as { createdAt: string }) : e.value;
        if (new Date(parsed.createdAt).getTime() < cutoff) await domain.delete(e.key);
      } catch {
        /* skip malformed */
      }
    }
  }

  async listPitfalls(): Promise<PitfallEntry[]> {
    const domain = this.#domains.pitfalls;
    if (!domain) return [];
    const entries = await domain.list<string>("pit:");
    return entries
      .map((e) => {
        try {
          return JSON.parse(e.value) as PitfallEntry;
        } catch {
          return undefined;
        }
      })
      .filter((x): x is PitfallEntry => x !== undefined);
  }

  /* ----- attempts (failed drafts are germplasm) ----- */

  async recordAttempt(entry: Omit<AttemptEntry, "createdAt">): Promise<void> {
    const domain = this.#domains.attempts;
    if (!domain) return;
    const key = `att:${entry.routeId}:${hashString(entry.candidate)}`;
    await domain.put(key, JSON.stringify({ ...entry, createdAt: new Date().toISOString() }));
  }

  async listAttempts(routeId: string): Promise<AttemptEntry[]> {
    const domain = this.#domains.attempts;
    if (!domain) return [];
    const entries = await domain.list<string>(`att:${routeId}:`);
    return entries
      .map((e) => {
        try {
          return JSON.parse(e.value) as AttemptEntry;
        } catch {
          return undefined;
        }
      })
      .filter((x): x is AttemptEntry => x !== undefined);
  }

  /* ----- battle log + bandit weights ----- */

  async recordBattle(record: BattleRecord): Promise<void> {
    const domain = this.#domains.battle;
    if (!domain) return;
    await domain.put(`battle:${record.campaignId}`, JSON.stringify(record));
    await this.#updateBandit(record);
  }

  /** Bandit weights: pattern choice becomes data-driven over time. */
  async banditWeights(taskClass: string): Promise<Readonly<Record<PatternId, number>>> {
    const domain = this.#domains.battle;
    if (!domain) return {};
    const entries = await domain.list<string>("battle:");
    const weights = {} as Record<PatternId, number>;
    for (const e of entries) {
      try {
        const r = JSON.parse(e.value) as BattleRecord;
        if (r.taskClass !== taskClass) continue;
        const w = weights[r.patternId] ?? 1;
        weights[r.patternId] = w * (r.success && r.userAccepted ? 1.1 : 0.9);
      } catch {
        /* skip */
      }
    }
    return weights;
  }

  async #updateBandit(record: BattleRecord): Promise<void> {
    // weights are derived on read (banditWeights), nothing to persist here.
    void record;
  }

  /** Read-only handle for the status tool. */
  async summary(): Promise<Record<string, number>> {
    return {
      pitfalls: (await this.listPitfalls()).length,
      attempts: (await this.listAttempts("")).length,
    };
  }
}