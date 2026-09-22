/**
 * 「知見の経緯」トラックのデータ型。
 *
 * 正本は `<docsRoot>/report/daily-research/*.md` と `<docsRoot>/report/weekly-research/*.md`。
 * リリース年表（`../releaseTimeline`）が同じレポートから「リリース」を拾うのに対し、
 * こちらはリリースに紐づかない知見——運用手法・技術動向・新語彙——を拾う。
 * 抽出した生データ（data/insight-timeline/raw/*.json）を
 * `scripts/build-insight-timeline.ts` が正規化して insights.json を作る。
 */
import type { DateConfidence } from '../releaseTimeline/types';

export type { DateConfidence };

/**
 * 知見の由来セクション。
 *
 * 日次レポートの `claude-code` / `tech-trend` / `vocabulary` と、週次レポートの
 * `ecosystem`（Codex・Gemini・Ollama・利用モジュールの動向）に対応する。
 * 経済ニュースのセクションは収録対象外なので、対応する値を持たない。
 */
export type InsightCategory = 'claude-code' | 'tech-trend' | 'vocabulary' | 'ecosystem';

/** レポートが記した影響度。表記ゆれ（高/中/低）は正規化時に吸収する */
export type InsightImpact = 'high' | 'medium' | 'low';

/**
 * 知見を束ねるテーマ。
 *
 * Why not: 抽出時の自由記述にしない。「サブエージェント」「サブエージェント運用」
 * 「subagent」が別テーマになると、テーマ内の時系列＝経緯が成立しない。辞書にある
 * id だけを使い、辞書に無い id は正規化が例外で落とす。
 */
export interface InsightTheme {
  readonly id: string;
  readonly label: string;
  /** そのテーマが何を指すか。抽出する側が境界を判断するための定義 */
  readonly description: string;
}

/** 抽出直後の生データ。影響度の表記ゆれをそのまま許容する */
export interface RawInsight {
  readonly date: string;
  readonly dateConfidence: DateConfidence;
  readonly category: InsightCategory;
  readonly title: string;
  readonly summary: string;
  readonly themes: readonly string[];
  readonly impact?: string | null;
  readonly sourceReport: string;
  readonly sourceUrl?: string | null;
}

/** 出典（どのレポートの、どの一次ソースに基づくか） */
export interface InsightSource {
  readonly report: string;
  readonly url: string | null;
}

/** 正規化済みの知見エントリ */
export interface InsightEntry {
  /** 安定 ID（日付 + タイトルスラッグ）。React key と DOM アンカーに使う */
  readonly id: string;
  readonly date: string;
  readonly dateConfidence: DateConfidence;
  readonly category: InsightCategory;
  readonly title: string;
  readonly summary: string;
  readonly themes: readonly string[];
  readonly impact: InsightImpact | null;
  readonly sources: readonly InsightSource[];
}

/** 1 テーマ分の経緯。entries は日付降順（新しい順）で、リリース年表と同じ向きに並ぶ */
export interface InsightThemeTrack {
  readonly themeId: string;
  readonly label: string;
  readonly description: string;
  readonly entries: readonly InsightEntry[];
  /** 収録範囲。見出しの「2026-05〜08」に使う */
  readonly from: string;
  readonly to: string;
}
