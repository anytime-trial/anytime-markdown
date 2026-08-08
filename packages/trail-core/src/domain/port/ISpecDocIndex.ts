import type { AlignmentInput } from './IFileChangeResolver';

export interface SpecDocRef {
  /** docs リポジトリ相対パス。例: spec/31.trail/04.memory-core/memory-core.ja.md */
  readonly specPath: string;
  readonly c4Scope: readonly string[];
}

/**
 * 設計書が変更単位の中で更新されたかの判定結果。
 *
 * `unknown` は「判定に必要なデータが揃っていない」ことを表す。設計書リポジトリの
 * コミットが activity.db へ取り込まれていない期間は更新の有無を判定できず、これを
 * `not-updated` と同一視すると全件が stale として報告され警報が無意味になる
 * （2026-05-23 以降に実際に発生した）。取込欠落は未更新と区別する。
 */
export type SpecUpdateStatus = 'updated' | 'not-updated' | 'unknown';

export interface ISpecDocIndex {
  /** elementId（例 pkg_trail-core）を c4Scope に含む設計書を返す */
  findByC4Element(elementId: string): Promise<readonly SpecDocRef[]>;
  /** その変更単位（session または range）の中でこの設計書が更新されたか */
  wasUpdatedIn(specPath: string, input: AlignmentInput): Promise<SpecUpdateStatus>;
}
