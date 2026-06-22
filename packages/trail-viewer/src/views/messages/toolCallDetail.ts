/**
 * ToolCallDetail の vanilla DOM 版（`components/messages/ToolCallDetail.tsx` の素 DOM 等価）。
 *
 * ツール呼び出しの入力と結果をカード形式で表示する。
 * --am-color-* CSS 変数でテーマに追従し、React / MUI に依存しない。
 */
import { createChip, Commit as CommitIcon } from '@anytime-markdown/ui-core';
import type { TrailToolCall } from '../../domain/parser/types';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

export interface ToolCallDetailProps {
  t: (key: string) => string;
  toolCall: TrailToolCall;
  commitHashes?: readonly string[];
}

function formatJson(value: Record<string, unknown> | string): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

const CARD_CSS =
  'margin-top:8px;padding:12px;' +
  'border:1px solid var(--am-color-divider);' +
  'background-color:var(--am-color-bg-paper);' +
  'border-radius:8px;';

const CODE_CSS =
  'margin:0;padding:8px;max-height:300px;overflow:auto;' +
  'white-space:pre-wrap;word-break:break-word;' +
  'background-color:var(--am-color-bg-default);' +
  'border-radius:4px;font-family:monospace;font-size:0.8rem;' +
  'outline:none;';

const CAPTION_CSS =
  'color:var(--am-color-text-secondary);display:block;margin-bottom:4px;' +
  'font-size:0.75rem;';

function buildDom(props: ToolCallDetailProps): HTMLDivElement {
  const { t, toolCall, commitHashes } = props;

  const isGitCommitBash =
    toolCall.name === 'Bash' &&
    typeof toolCall.input?.command === 'string' &&
    (toolCall.input.command as string).includes('git commit');

  // Card root
  const card = document.createElement('div');
  card.style.cssText = CARD_CSS;

  // Header row: tool name + optional commit chips
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;';

  const nameEl = document.createElement('span');
  nameEl.style.cssText = 'font-size:0.875rem;font-weight:600;';
  nameEl.textContent = toolCall.name;
  header.appendChild(nameEl);

  if (isGitCommitBash && commitHashes && commitHashes.length > 0) {
    for (const hash of commitHashes) {
      const iconEl = CommitIcon({ fontSize: 12 }).el;
      iconEl.style.marginRight = '2px';
      iconEl.style.flexShrink = '0';

      const { el: chip } = createChip({
        label: `#${hash.slice(0, 7)}`,
        size: 'small',
        variant: 'outlined',
      });
      chip.style.cssText +=
        'height:18px;font-size:0.65rem;' +
        'color:var(--trv-color-ice-blue,#64b5f6);' +
        'border-color:var(--trv-color-ice-blue,#64b5f6);' +
        'background-color:transparent;';
      chip.setAttribute('aria-label', `commit ${hash}`);
      // Prepend icon before the label span
      chip.insertBefore(iconEl, chip.firstChild);
      header.appendChild(chip);
    }
  }

  card.appendChild(header);

  // Input section
  const inputSection = document.createElement('div');
  inputSection.style.marginBottom = toolCall.result !== undefined ? '8px' : '0';

  const inputCaption = document.createElement('span');
  inputCaption.style.cssText = CAPTION_CSS;
  inputCaption.textContent = t('message.input');
  inputSection.appendChild(inputCaption);

  const inputPre = document.createElement('pre');
  inputPre.style.cssText = CODE_CSS;
  inputPre.tabIndex = 0;
  inputPre.setAttribute('aria-label', t('message.inputCode'));
  inputPre.addEventListener('focus', () => {
    inputPre.style.outline = '2px solid var(--trv-color-ice-blue,#64b5f6)';
  });
  inputPre.addEventListener('blur', () => {
    inputPre.style.outline = 'none';
  });
  inputPre.textContent = formatJson(toolCall.input);
  inputSection.appendChild(inputPre);
  card.appendChild(inputSection);

  // Result section (conditional)
  if (toolCall.result !== undefined) {
    const resultSection = document.createElement('div');

    const resultCaption = document.createElement('span');
    resultCaption.style.cssText = CAPTION_CSS;
    resultCaption.textContent = t('message.result');
    resultSection.appendChild(resultCaption);

    const resultPre = document.createElement('pre');
    resultPre.style.cssText = CODE_CSS;
    resultPre.tabIndex = 0;
    resultPre.setAttribute('aria-label', t('message.resultCode'));
    resultPre.addEventListener('focus', () => {
      resultPre.style.outline = '2px solid var(--trv-color-ice-blue,#64b5f6)';
    });
    resultPre.addEventListener('blur', () => {
      resultPre.style.outline = 'none';
    });
    resultPre.textContent = toolCall.result;
    resultSection.appendChild(resultPre);
    card.appendChild(resultSection);
  }

  return card;
}

export function mountToolCallDetail(
  container: HTMLElement,
  initial: ToolCallDetailProps,
): VanillaViewHandle<ToolCallDetailProps> {
  let root = buildDom(initial);
  container.appendChild(root);

  return {
    update(next) {
      const newRoot = buildDom(next);
      container.replaceChild(newRoot, root);
      root = newRoot;
    },
    destroy() {
      root.remove();
    },
  };
}
