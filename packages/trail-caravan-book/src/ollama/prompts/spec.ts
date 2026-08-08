import type { FilteredParagraph } from '../../ingest/spec/preFilterClaims';

export interface SpecPromptInput {
  paragraphs: FilteredParagraph[];
  c4Scope: string[];
}

const SYSTEM_PROMPT_CORE = `あなたは仕様書から requirement claims を抽出するアシスタントです。
以下の段落から subject/predicate/object/modality を JSON 形式で抽出してください。

subject 候補は c4Scope に列挙されたコンポーネント名です。
出力例 (summary は必須):
{"summary":"段落全体の1〜2文要約","claims":[{"subject":{"type":"Component","name":"X"},"predicate":"must","object":{"type":"Concept","name":"Y"},"modality":"mandatory","line_hint":12,"confidence":0.8}]}

制約:
- modality は "mandatory" / "forbidden" / "recommended" のみ
- 測定不能な定性表現（「読みやすく」「効率的に」等）は除外
- confidence は 0.6〜0.85
- JSON のみを返し、説明文を含めない`;

/**
 * 文書全体（title + body）を 2〜3 文で要約させる専用プロンプト。
 *
 * claim 抽出（`buildSpecPrompt`）は `preFilterClaims` 後の modality 段落のみを
 * 入力とするため、その副産物 summary は文書を代表しない断片になっていた。
 * 要約は文書全体を読ませる独立ステップに分離する。
 */
const SUMMARY_PROMPT_CORE = `あなたは技術文書を要約するアシスタントです。
以下の文書全体を読み、文書が何を定義・主張しているかを日本語 2〜3 文で要約してください。

制約:
- 日本語で記述（英語・中国語禁止）
- 文書の主題・対象・主要な要求/結論を含める。冒頭1段落だけを抜き出さない
- 個別の細かい制約を列挙せず、文書全体の要旨を述べる
- JSON のみを返す。形式: {"summary":"<2〜3文の日本語要約>"}`;

/** body が長い場合に prompt へ渡す最大文字数（num_ctx 肥大を防ぐ）。 */
export const SPEC_SUMMARY_BODY_MAX_CHARS = 6000;

export function buildSpecSummaryPrompt(input: { title: string; body: string }): string {
  const { title, body } = input;
  const truncated =
    body.length > SPEC_SUMMARY_BODY_MAX_CHARS
      ? `${body.slice(0, SPEC_SUMMARY_BODY_MAX_CHARS)}\n…(以下省略)`
      : body;
  return `${SUMMARY_PROMPT_CORE}\n\nタイトル: ${title}\n\n本文:\n${truncated}`;
}

/**
 * Build a prompt for spec claim extraction from filtered paragraphs.
 */
export function buildSpecPrompt(input: SpecPromptInput): string {
  const { paragraphs, c4Scope } = input;

  const scopeSection =
    c4Scope.length > 0
      ? `c4Scope（subject 候補）: ${c4Scope.join(', ')}`
      : 'c4Scope: （指定なし）';

  const paragraphsSection = paragraphs
    .map(
      (p, i) =>
        `--- 段落 ${i + 1} (line_start=${p.line_start}, modality_hint=${p.modality_hint}) ---\n${p.text}`,
    )
    .join('\n\n');

  return `${SYSTEM_PROMPT_CORE}\n\n${scopeSection}\n\n以下の段落を分析し、JSON のみを返してください:\n\n${paragraphsSection}`;
}
