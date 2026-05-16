import { Emitter, type Disposable } from '../util/Emitter';
import type { ThresholdEvent, UsageRecord } from './types';

interface MutableUsageRecord {
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  periodStart: string;
  lastUpdatedAt: string;
}

export class UsageTracker {
  private readonly records = new Map<string, MutableUsageRecord>();
  private readonly thresholds = new Map<string, number>();
  private readonly firedThresholds = new Set<string>();
  private readonly thresholdExceeded = new Emitter<ThresholdEvent>();

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  record(providerId: string, model: string, inputTokens: number, outputTokens: number): void {
    if (inputTokens < 0 || outputTokens < 0) {
      throw new Error(
        `UsageTracker token counts must be non-negative: in=${inputTokens} out=${outputTokens}`
      );
    }
    const now = this.clock();
    const key = recordKey(providerId, model);
    const existing = this.records.get(key);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.callCount += 1;
      existing.lastUpdatedAt = now;
    } else {
      this.records.set(key, {
        providerId,
        model,
        inputTokens,
        outputTokens,
        callCount: 1,
        periodStart: now,
        lastUpdatedAt: now,
      });
    }

    const threshold = this.thresholds.get(providerId);
    if (threshold !== undefined && !this.firedThresholds.has(providerId)) {
      const total = this.totalTokensFor(providerId);
      if (total >= threshold) {
        this.firedThresholds.add(providerId);
        this.thresholdExceeded.emit({ providerId, totalTokens: total, threshold });
      }
    }
  }

  getSnapshot(opts?: { providerId?: string; sinceIso?: string }): UsageRecord[] {
    const all: UsageRecord[] = [];
    for (const r of this.records.values()) {
      if (opts?.providerId !== undefined && r.providerId !== opts.providerId) continue;
      if (opts?.sinceIso !== undefined && r.lastUpdatedAt < opts.sinceIso) continue;
      all.push({ ...r });
    }
    return all;
  }

  setThreshold(providerId: string, maxTokens: number): void {
    if (maxTokens <= 0) {
      throw new Error(`UsageTracker threshold must be > 0, got ${maxTokens}`);
    }
    this.thresholds.set(providerId, maxTokens);
    this.firedThresholds.delete(providerId);
  }

  clearThreshold(providerId: string): void {
    this.thresholds.delete(providerId);
    this.firedThresholds.delete(providerId);
  }

  reset(providerId?: string): void {
    if (providerId === undefined) {
      this.records.clear();
      this.firedThresholds.clear();
      return;
    }
    for (const [key, r] of this.records) {
      if (r.providerId === providerId) this.records.delete(key);
    }
    this.firedThresholds.delete(providerId);
  }

  onThresholdExceeded(listener: (event: ThresholdEvent) => void): Disposable {
    return this.thresholdExceeded.on(listener);
  }

  dispose(): void {
    this.thresholdExceeded.dispose();
  }

  private totalTokensFor(providerId: string): number {
    let total = 0;
    for (const r of this.records.values()) {
      if (r.providerId === providerId) total += r.inputTokens + r.outputTokens;
    }
    return total;
  }
}

function recordKey(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}
