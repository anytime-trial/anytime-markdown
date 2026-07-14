import type { AlignmentInput } from './IFileChangeResolver';

export interface SpecDocRef {
  /** docs リポジトリ相対パス。例: spec/31.trail/04.memory-core/memory-core.ja.md */
  readonly specPath: string;
  readonly c4Scope: readonly string[];
}

export interface ISpecDocIndex {
  /** elementId（例 pkg_trail-core）を c4Scope に含む設計書を返す */
  findByC4Element(elementId: string): Promise<readonly SpecDocRef[]>;
  /** その変更単位（session または range）の中でこの設計書が更新されたか */
  wasUpdatedIn(specPath: string, input: AlignmentInput): Promise<boolean>;
}
