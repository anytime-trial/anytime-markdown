import type { Ignore } from 'ignore';
import type { TrailGraph } from '../model/types';

/** 言語アナライザへの解析入力。configPath は言語ごとの設定ファイル（TS なら tsconfig.json）。 */
export interface LanguageAnalyzeInput {
  readonly projectRoot: string;
  readonly configPath?: string;
  readonly exclude?: Ignore;
  readonly includeTests?: boolean;
  readonly onProgress?: (phase: string) => void;
}

/**
 * 各言語パッケージが実装する解析プロバイダ契約。
 * detect() で対象言語かを判定し、analyze() で TrailGraph を返す。
 */
export interface LanguageAnalyzer {
  readonly id: string;
  /** repoRoot が当該言語のプロジェクトかを判定する（設定ファイル・拡張子の有無など）。 */
  detect(repoRoot: string): boolean;
  analyze(input: LanguageAnalyzeInput): TrailGraph;
}
