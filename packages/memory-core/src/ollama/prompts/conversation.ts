export interface EpisodeInput {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  valid_from: string;
  raw_excerpt: string;
}

const SYSTEM_PROMPT_CORE = `あなたは Claude Code / Codex のセッションログから事実を抽出するアナリストです。
以下のスキーマに従い、ブロック内に登場する事実を JSON で返してください。

【厳守ルール】
1. summary は必ず日本語で記述してください。英語や中国語は禁止です。
2. relations の subject / object は、必ず entities[] で先に列挙した (type, name) を参照してください。entities[] にない概念を relation の subject/object に使わないでください。
3. 同じ (subject.type, subject.name, predicate, object.type, object.name) の組み合わせは 1 回だけ出力してください。重複や類似の繰り返しは禁止です。
4. caused_by edge:
   - subject は必ず Bug 型のエンティティに限定してください。
   - object は本文中に具体的な path / name / sha が現れている
     File / Package / Library / Tool / Commit / Bug のいずれかに限定してください。
   - 「不適切な〜」「〜不足」「〜違反」等の一般化された抽象概念
     (Concept / Decision / Rule / Person / Project / Question / Task / Skill 型)
     を caused_by の object にすることは禁止です。
   - 具体的な原因 entity が本文から特定できない場合は、その caused_by relation を出力しないでください。
5. relations の subject.name / object.name に "undefined"、null、空文字、placeholder 値を含めないでください。relation を構成する 2 つのエンティティが本文から具体的に抽出できない場合は、その relation を出力しないでください。

エンティティ型: Person, Project, Package, File, Library, Tool, Concept,
                Decision, Bug, Task, Skill, Rule, Commit, Question
リレーション述語: prefers, dislikes, depends_on, replaces, relates_to,
              mentioned_in, authored_by, works_on, uses, fixes,
              affects, caused_by, introduced_by,
              asked_by, answered_in

不具合分析が登場した場合は、Bug entity と、特定可能な具体的根本原因
(File / Package / Library / Tool / Commit / Bug) への caused_by edge を抽出してください。
抽象概念 (Concept / Decision / Rule) を root cause にすることは禁止です。
confidence は LLM 推論なので 0.6〜0.85 の範囲で付与してください。`;

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

const OUTPUT_INSTRUCTIONS = `出力フォーマット (キーのみ参考。値は本文から抽出した日本語で埋めること):
{"summary":"<本文を日本語で1〜2文要約>","entities":[{"type":"<上記の型>","name":"<本文中の表現>"}],"relations":[{"subject":{"type":"<entitiesに登録した型>","name":"<entitiesに登録した名前>"},"predicate":"<上記の述語>","object":{"type":"<entitiesに登録した型>","name":"<entitiesに登録した名前>"},"confidence":0.7}]}

valid_from は会話内に時間表現があれば ISO 8601 で付与、無ければ省略してください。
JSON のみを返してください。出力フォーマット例の文字列 (react, ueda, Conventional Commits 等) を本文から抽出できない場合は使用禁止です:`;

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
