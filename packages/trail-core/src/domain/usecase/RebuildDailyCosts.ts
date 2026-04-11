// domain/usecase/RebuildDailyCosts.ts — Rebuild daily cost aggregation

import type { ICostRepository } from '../port/ICostRepository';

export class RebuildDailyCosts {
  constructor(private readonly costRepo: ICostRepository) {}

  execute(tzOffset: string): void {
    this.costRepo.rebuildDailyCosts(tzOffset);
  }
}
