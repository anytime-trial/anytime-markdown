export interface EpisodeInput {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  valid_from: string;
  raw_excerpt: string;
}

const SYSTEM_PROMPT_CORE = `あなたは Claude Code / Codex のセッションログから事実を抽出するアナリストです。
以下のスキーマに従い、ブロック内に登場する事実を JSON で返してください。

エンティティ型: Person, Project, Package, File, Library, Tool, Concept,
                Decision, Bug, Task, Skill, Rule, Commit, Question
リレーション: prefers, dislikes, depends_on, replaces, relates_to,
              mentioned_in, authored_by, works_on, uses, fixes,
              affects, caused_by, introduced_by,
              asked_by, answered_in

不具合分析（why-why-why 3 段以上）が登場した場合は、
Bug entity と caused_by edge（Bug → 根本原因の Concept / Decision / Rule）を
必ず抽出してください。confidence は LLM 推論なので 0.6〜0.85 の範囲で付与してください。`;

const QUESTION_EXTRACTION_INSTRUCTIONS = `ブロック内のユーザーメッセージに疑問符が 1 つ以上含まれており、かつ
仕様 / 設計 / 実装の確認意図がある場合（「〜は…でしょうか？」「〜に含まれていますか？」
「どう動きますか？」等）は、Question entity を抽出してください:
  - text: 質問文（要約せず原文ベース、200 文字以内）
  - target_spec_path: c4Scope や本文中の spec/... バッククォート path から逆引き可能なら
                     最も関連する spec doc の rel_path、無ければ null
  - target_symbol: 関連する関数名 / クラス名 / ファイル名があれば、無ければ null
  - asked_by: ユーザーの canonical_name（既知なら "ueda" 等）
  - answered_in: この episode 内で回答が完結したら true、続く episode に持ち越すなら false

雑談や AI への単純指示（「〜して」「〜お願い」）は Question として抽出しません。
疑問符が含まれていても回答が不要な修辞疑問・確認発話（「いいですか？」「OK?」等）は除外します。`;

const QUESTION_SKIP_INSTRUCTION = `Question entity は抽出しません。`;

const OUTPUT_INSTRUCTIONS = `出力例:
{
    "summary": "ブロック全体の 1〜2 文要約",
    "entities": [
        {"type":"Library","name":"react","aliases":["React.js"],"tags":[],"attributes":{}}
    ],
    "relations": [
        {
            "subject":{"type":"Person","name":"ueda"},
            "predicate":"prefers",
            "object":{"type":"Concept","name":"Conventional Commits"},
            "valid_from": null,
            "confidence": 0.9
        }
    ]
}

valid_from は会話内に「先週」「昨日」等の時間表現があれば ISO 8601 で、なければ null。

以下の episode 本文を分析し、JSON のみを返してください:`;

export function buildConversationPrompt(episode: EpisodeInput): string {
  const systemPrompt = [
    SYSTEM_PROMPT_CORE,
    QUESTION_EXTRACTION_INSTRUCTIONS,
    OUTPUT_INSTRUCTIONS,
  ].join('\n\n');

  return `${systemPrompt}\n\n${episode.raw_excerpt}`;
}

export function buildConversationPromptNoQuestion(episode: EpisodeInput): string {
  const systemPrompt = [
    SYSTEM_PROMPT_CORE,
    QUESTION_SKIP_INSTRUCTION,
    OUTPUT_INSTRUCTIONS,
  ].join('\n\n');

  return `${systemPrompt}\n\n${episode.raw_excerpt}`;
}
