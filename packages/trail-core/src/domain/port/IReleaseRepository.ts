// domain/port/IReleaseRepository.ts — Release data access port

import type { ReleaseFileRow, ReleaseFeatureRow } from '../model/task';

export interface IReleaseRepository {
  existsByTag(tag: string): boolean;
  insertFiles(releaseTag: string, files: readonly ReleaseFileRow[]): void;
  insertFeatures(releaseTag: string, features: readonly ReleaseFeatureRow[]): void;
}
