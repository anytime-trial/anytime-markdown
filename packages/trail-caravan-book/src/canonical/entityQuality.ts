/**
 * 検索結果に混ぜる価値のない「低情報エンティティ」の判定。
 *
 * LLM 抽出（conversation 由来）はエンティティ名を確定できないとき
 * `undefined` / 「不明のバグ」「未命名のバグ」等のプレースホルダ名で
 * エンティティを生成する（2026-08-09 実測で active 77 件）。これらは
 * embedding が汎用語彙に寄るため類似度検索の上位を占拠しやすい。
 * 判定は 2 箇所で共用する: 検索（retrieve / rag）のランク付け除外と、
 * 取込（ingest/conversation/persist）での生成抑制（T-21）。既存の低情報
 * エンティティはグラフに残る（辺の端点として意味を持つ）が、新規生成は
 * 取込側で止まる。
 */

const EXACT_PLACEHOLDER = new Set([
  'undefined',
  'unknown',
  'null',
  'n/a',
  'none',
  '不明',
  '無名',
  '未命名',
  '未定',
]);

/** 「<不明系修飾>の<総称>」の全体一致のみ。修飾に続く具体的な説明文は除外しない */
const QUALIFIED_GENERIC = /^(不明|未命名|無名|特定)\s*の?\s*(バグ|bug|エラー|error|問題|issue)$/i;

const BARE_GENERIC = new Set(['バグ', 'bug', 'エラー', 'error', '問題', 'issue']);

const RESCUE_SUMMARY_MIN_LENGTH = 20;

export function isLowInformationEntity(displayName: string, summary: string): boolean {
  const name = displayName.trim();
  if (name === '') return true; // 名前が無いものは summary の有無によらず表示不能

  if (summary.trim().length >= RESCUE_SUMMARY_MIN_LENGTH) return false;

  const lower = name.toLowerCase();
  if (EXACT_PLACEHOLDER.has(lower)) return true;
  if (BARE_GENERIC.has(lower)) return true;
  return QUALIFIED_GENERIC.test(name);
}
