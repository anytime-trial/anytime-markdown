/**
 * MessageBubble の vanilla DOM 版。
 * user/assistant メッセージを吹き出しで描画し、citation タグをインライン Chip に変換する。
 */
import { createPaper } from '@anytime-markdown/ui-core';
import type { ChatUiMessage, ChatUiSource } from '../../components/memory/chatReducer';
import { createCitationChip } from './citationChip';

export interface MessageBubbleProps {
  readonly message: ChatUiMessage;
  readonly sources: ReadonlyArray<ChatUiSource>;
  readonly onCitationClick?: (tag: string) => void;
}

/** [^kind:id] 形式の citation タグを抽出する正規表現。 */
const CITATION_RE = /\[\^(entity|episode|drift):([a-zA-Z0-9_-]+)\]/g;

interface InlineToken {
  readonly kind: 'text' | 'citation';
  readonly value: string;
  readonly tag?: string;
}

function tokenizeContent(content: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIdx = 0;
  CITATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(content)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ kind: 'text', value: content.slice(lastIdx, match.index) });
    }
    tokens.push({ kind: 'citation', value: match[0], tag: `${match[1]}:${match[2]}` });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    tokens.push({ kind: 'text', value: content.slice(lastIdx) });
  }
  return tokens;
}

/**
 * メッセージ吹き出し要素を生成して返す（`el` プロパティ）。
 * 葉ノードなので更新は呼び出し側が新規生成して置換する。
 */
export function createMessageBubble(props: MessageBubbleProps): { el: HTMLElement; destroy: () => void } {
  const { message, sources, onCitationClick } = props;
  const isUser = message.role === 'user';
  const sourceByTag = new Map(sources.map((s) => [`${s.kind}:${s.id}`, s]));
  const tokens = tokenizeContent(message.content);
  // citation chip の tooltip（document.body 直下）を破棄するため destroy を集約する。
  const citationDestroys: Array<() => void> = [];

  const outer = document.createElement('div');
  outer.style.cssText = `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin:8px 0;`;

  const { el: paper } = createPaper({ variant: 'outlined' });
  paper.style.cssText =
    `padding:12px;max-width:85%;` +
    `background-color:${isUser ? 'var(--am-color-action-hover)' : 'var(--am-color-bg-paper)'};` +
    `opacity:${message.interrupted ? '0.7' : '1'};`;

  const contentWrap = document.createElement('div');
  contentWrap.style.cssText = 'white-space:pre-wrap;word-break:break-word;';

  for (const tk of tokens) {
    if (tk.kind === 'text') {
      contentWrap.appendChild(document.createTextNode(tk.value));
    } else {
      const tag = tk.tag ?? tk.value;
      const sourceTitle = sourceByTag.get(tk.tag ?? '')?.title;
      const chip = createCitationChip({
        tag,
        title: sourceTitle,
        onClick: onCitationClick,
      });
      citationDestroys.push(chip.destroy);
      contentWrap.appendChild(chip.el);
    }
  }

  paper.appendChild(contentWrap);

  if (message.error) {
    const errEl = document.createElement('span');
    errEl.style.cssText =
      'display:block;margin-top:8px;font-size:0.75rem;color:var(--am-color-error-main);';
    errEl.textContent = message.error;
    paper.appendChild(errEl);
  }

  if (message.interrupted) {
    const intEl = document.createElement('span');
    intEl.style.cssText =
      'display:block;margin-top:8px;font-size:0.75rem;color:var(--am-color-text-secondary);';
    intEl.textContent = '(interrupted)';
    paper.appendChild(intEl);
  }

  outer.appendChild(paper);
  return {
    el: outer,
    destroy: () => {
      for (const d of citationDestroys) d();
    },
  };
}
