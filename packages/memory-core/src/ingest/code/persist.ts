/**
 * Shared upsert helpers for code-ingest pipeline.
 *
 * Each ingest function (fromTrailGraph, astFunctionLevel, extractComments,
 * extractCommitRationale) manages its own DB writes internally.  This file
 * re-exports the types used by those modules so that callers can import them
 * from a single location.
 *
 * TODO: refactor individual ingest modules to delegate DB writes here once
 *       the ingest surface is stable.
 */

export type { FromTrailGraphStats } from './fromTrailGraph';
export type { AstFactStats } from './astFunctionLevel';
export type { ExtractCommentsStats } from './extractComments';
export type { ExtractRationaleStats } from './extractCommitRationale';
