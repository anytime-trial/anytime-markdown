import type { FilteredParagraph } from '../../ingest/spec/preFilterClaims';

export interface SpecPromptInput {
  paragraphs: FilteredParagraph[];
  c4Scope: string[];
}

const SYSTEM_PROMPT_CORE = `あなたは仕様書から requirement claims を抽出するアシスタントです。
以下の段落から subject/predicate/object/modality を JSON 形式で抽出してください。

subject 候補は c4Scope に列挙されたコンポーネント名です。
出力は以下の JSON スキーマに従ってください:

{
  "summary": "段落全体の 1〜2 文要約",
  "claims": [
    {
      "subject": { "type": "<エンティティ型>", "name": "<名前>" },
      "predicate": "<動詞句>",
      "object": { "type": "<エンティティ型>", "name": "<名前>" },
      "modality": "mandatory" | "forbidden" | "recommended",
      "line_hint": <段落の開始行番号>,
      "confidence": <0.0〜1.0 の信頼度>
    }
  ]
}

制約:
- modality は "mandatory" / "forbidden" / "recommended" のみ使用する
- 測定不能な定性表現（「読みやすく」「効率的に」等）は除外する
- confidence は LLM 推論なので 0.6〜0.85 の範囲で付与する
- JSON のみを返し、説明文を含めない`;

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
