import type { ChatMessage } from './types';
import type { RankSource } from '../rag/reciprocalRankFusion';

export interface PromptSource {
  readonly kind: 'entity' | 'episode' | 'drift';
  readonly id: string;
  readonly type?: string;
  readonly repo?: string;
  readonly sources: ReadonlyArray<RankSource>;
  readonly display_name?: string;
  readonly summary?: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly excerpt?: string;
}

export interface BuildPromptInput {
  readonly query: string;
  readonly history: ReadonlyArray<ChatMessage>;
  readonly sources: ReadonlyArray<PromptSource>;
  /** Context に含める source 数。default 12 */
  readonly sourceLimit?: number;
  /** History として直近何件含めるか。default 6 */
  readonly historyLimit?: number;
}

const SYSTEM_PROMPT = `あなたは anytime-markdown のコードベース・設計ドキュメント・会話履歴に
精通したアシスタントです。回答は日本語、結論ファーストで簡潔に。
回答中に参照したソースを必ず [^entity:id] / [^episode:id] / [^drift:id] の
形式で引用してください。引用がない断定はしないでください。
[Context] ブロック以外の知識を勝手に補完しないでください。`;

function renderSource(s: PromptSource): string {
  const attrs = [
    `id="${s.kind}:${s.id}"`,
    s.type ? `type="${s.type}"` : '',
    s.repo ? `repo="${s.repo}"` : '',
    `sources="${s.sources.join(',')}"`,
  ]
    .filter(Boolean)
    .join(' ');
  const lines = [
    s.display_name ? `display_name: ${s.display_name}` : '',
    s.summary ? `summary: ${s.summary}` : '',
    s.aliases && s.aliases.length > 0 ? `aliases: [${s.aliases.join(', ')}]` : '',
    s.excerpt ? `excerpt: ${s.excerpt}` : '',
  ].filter(Boolean);
  return `<source ${attrs}>\n${lines.join('\n')}\n</source>`;
}

export function buildPrompt(input: BuildPromptInput): ChatMessage[] {
  const sourceLimit = input.sourceLimit ?? 12;
  const historyLimit = input.historyLimit ?? 6;

  const limitedSources = input.sources.slice(0, sourceLimit);
  const contextBody =
    limitedSources.length > 0
      ? limitedSources.map(renderSource).join('\n\n')
      : '(関連ソースが見つかりませんでした)';

  const recentHistory = input.history.slice(-historyLimit);

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `[Context]\n${contextBody}` },
    ...recentHistory,
    { role: 'user', content: input.query },
  ];
}
