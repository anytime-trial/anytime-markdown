/**
 * Claude Code リリース年表のデータ型。
 *
 * 正本は `<docsRoot>/report/daily-research/*.md`（日次技術調査レポート）。
 * そこから抽出した生データ（data/claude-code-releases/raw/*.json）を
 * `scripts/build-release-timeline.ts` が正規化して releases.json を作る。
 */

/** cli = Claude Code 本体、model = Claude モデル（Opus/Sonnet/Fable/Mythos） */
export type ReleaseKind = 'cli' | 'model';

/** 日次レポートが記した影響度。表記ゆれ（高/中/低）は正規化時に吸収する */
export type ReleaseImpact = 'high' | 'medium' | 'low';

/** 日付の確度。explicit = レポート本文にリリース日が明記、report-date = レポート発行日で代用 */
export type DateConfidence = 'explicit' | 'report-date';

/** 抽出直後の生データ。フィールドの表記ゆれをそのまま許容する */
export interface RawRelease {
  readonly version: string;
  readonly kind: ReleaseKind;
  readonly date: string;
  readonly dateConfidence: DateConfidence;
  readonly headline: string;
  readonly highlights?: readonly string[] | null;
  readonly impact?: string | null;
  readonly sourceReport: string;
  readonly sourceUrl?: string | null;
}

/** 出典（どの日次/週次レポートの、どの一次ソースに基づくか） */
export interface ReleaseSource {
  readonly report: string;
  readonly url: string | null;
}

/** 正規化済みの年表エントリ */
export interface ReleaseEntry {
  /** 安定 ID（kind + バージョンスラグ）。React key と DOM アンカーに使う */
  readonly id: string;
  readonly kind: ReleaseKind;
  /** 表示用バージョン（cli は "2.1.224"、model は "Opus 5"） */
  readonly version: string;
  /** レポートが複数版をまとめて扱っていた場合の上限（例 2.1.136–2.1.138 の "2.1.138"） */
  readonly versionTo: string | null;
  /** cli の版数比較用。model や解析不能な版は null */
  readonly sortKey: readonly [number, number, number] | null;
  readonly date: string;
  readonly dateConfidence: DateConfidence;
  readonly headline: string;
  readonly highlights: readonly string[];
  readonly impact: ReleaseImpact | null;
  readonly sources: readonly ReleaseSource[];
}

/** 月次の件数集計（リリース頻度の推移を描くため） */
export interface MonthlyReleaseCount {
  /** YYYY-MM */
  readonly month: string;
  readonly cli: number;
  readonly model: number;
}
