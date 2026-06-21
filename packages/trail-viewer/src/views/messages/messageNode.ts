/**
 * MessageNode の vanilla DOM 版（`components/messages/MessageNode.tsx` の素 DOM 等価）。
 *
 * チャットバブル形式でメッセージを描画する。
 * --am-color-* / --trv-color-* CSS 変数でテーマに追従し、React / MUI に依存しない。
 */
import {
  createAvatar,
  createChip,
  createCollapse,
  Build as BuildIcon,
  Commit as CommitIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  SmartToy as SmartToyIcon,
} from '@anytime-markdown/ui-core';
import type { TrailMessage, TrailToolCall } from '../../domain/parser/types';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountToolCallDetail } from './toolCallDetail';

export interface MessageNodeProps {
  t: (key: string) => string;
  message: TrailMessage;
  depth: number;
}

const LINE_HEIGHT_PX = 20;
const COLLAPSED_LINES = 3;
const COLLAPSED_MAX_HEIGHT = LINE_HEIGHT_PX * COLLAPSED_LINES;

function getToolCallSummary(toolCall: TrailToolCall): string {
  const entries = Object.entries(toolCall.input);
  if (entries.length === 0) return toolCall.name;
  const [key, value] = entries[0];
  const valueStr =
    typeof value === 'string'
      ? value.slice(0, 60)
      : JSON.stringify(value).slice(0, 60);
  return `${toolCall.name}: ${key}=${valueStr}`;
}

interface ToolCallEntryHandle {
  el: HTMLDivElement;
  destroy: () => void;
}

function createToolCallEntry(
  toolCall: TrailToolCall,
  commitHashes: readonly string[] | undefined,
  t: (key: string) => string,
): ToolCallEntryHandle {
  let expanded = false;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin:4px 0;';

  // Toggle button row
  const toggleBtn = document.createElement('button');
  toggleBtn.style.cssText =
    'display:flex;align-items:center;width:100%;text-align:left;' +
    'border:none;background:none;cursor:pointer;padding:2px;border-radius:4px;' +
    'color:var(--am-color-text-primary);';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute(
    'aria-label',
    `${t('message.expandDetail')}: ${getToolCallSummary(toolCall)}`,
  );
  toggleBtn.addEventListener('focus', () => {
    toggleBtn.style.outline = `3px solid var(--trv-color-ice-blue,#64b5f6)`;
    toggleBtn.style.outlineOffset = '2px';
  });
  toggleBtn.addEventListener('blur', () => {
    toggleBtn.style.outline = 'none';
    toggleBtn.style.outlineOffset = '0';
  });

  const chevron = ExpandMoreIcon({ fontSize: 'small' }).el;
  chevron.style.cssText =
    'flex-shrink:0;transition:transform 0.2s;color:var(--am-color-text-secondary);';
  toggleBtn.appendChild(chevron);

  const summarySpan = document.createElement('span');
  summarySpan.style.cssText =
    'font-family:monospace;font-size:0.8rem;margin-left:4px;word-break:break-all;';
  summarySpan.textContent = getToolCallSummary(toolCall);
  toggleBtn.appendChild(summarySpan);

  wrapper.appendChild(toggleBtn);

  // Collapsible detail area
  const detailContainer = document.createElement('div');
  const collapse = createCollapse({
    in: false,
    unmountOnExit: true,
    children: detailContainer,
  });
  wrapper.appendChild(collapse.el);

  // Mount detail inside container (it will be unmounted/remounted by collapse)
  let detailHandle: VanillaViewHandle<Parameters<typeof mountToolCallDetail>[1]> | null = null;

  const mountDetail = (): void => {
    if (detailContainer.childNodes.length === 0) {
      detailHandle = mountToolCallDetail(detailContainer, {
        t,
        toolCall,
        commitHashes,
      });
    }
  };

  toggleBtn.addEventListener('click', () => {
    expanded = !expanded;
    chevron.style.transform = expanded ? 'rotate(180deg)' : 'none';
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    toggleBtn.setAttribute(
      'aria-label',
      expanded
        ? t('message.collapseDetail')
        : `${t('message.expandDetail')}: ${getToolCallSummary(toolCall)}`,
    );
    if (expanded) mountDetail();
    collapse.setOpen(expanded);
  });

  return {
    el: wrapper,
    destroy() {
      detailHandle?.destroy();
      collapse.destroy();
    },
  };
}

function buildSystemMessage(message: TrailMessage): HTMLDivElement {
  const root = document.createElement('div');
  root.setAttribute('data-message-uuid', message.uuid);
  root.style.cssText = 'display:flex;justify-content:center;padding:4px 0;';

  const badge = document.createElement('span');
  badge.style.cssText =
    'color:var(--am-color-text-disabled);' +
    'background-color:var(--am-color-action-hover);' +
    'padding:2px 12px;border-radius:16px;font-size:0.7rem;';
  badge.textContent = message.subtype ?? 'system';
  root.appendChild(badge);

  return root;
}

interface MessageNodeHandle {
  root: HTMLElement | null;
  toolCallHandles: ToolCallEntryHandle[];
}

function buildMessage(props: MessageNodeProps): MessageNodeHandle {
  const { t, message } = props;

  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;
  const textContent = (message.userContent ?? message.textContent ?? '').trim();
  const hasTextContent = textContent.length > 0;
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  // Skip empty messages (no text and no tool calls and not system)
  if (!hasTextContent && !hasToolCalls && !isSystem) {
    return { root: null, toolCallHandles: [] };
  }

  if (isSystem) {
    return { root: buildSystemMessage(message), toolCallHandles: [] };
  }

  const needsCollapse =
    textContent.split('\n').length > COLLAPSED_LINES || textContent.length > 200;

  // Avatar
  let avatarBgColor: string;
  let avatarIcon: SVGSVGElement;
  let avatarLabel: string;

  if (isUser) {
    avatarBgColor = 'var(--trv-avatar-user,#1565C0)';
    avatarIcon = PersonIcon({ fontSize: 'small', color: 'inherit' }).el;
    avatarLabel = t('message.type.user');
  } else if (isSystem) {
    avatarBgColor = 'var(--trv-avatar-system,#37474F)';
    avatarIcon = SettingsIcon({ fontSize: 'small', color: 'inherit' }).el;
    avatarLabel = t('message.type.system');
  } else if (hasToolCalls) {
    avatarBgColor = 'var(--trv-avatar-tool,#E65100)';
    avatarIcon = BuildIcon({ fontSize: 'small', color: 'inherit' }).el;
    avatarLabel = t('message.type.assistant');
  } else {
    avatarBgColor = 'var(--trv-avatar-assistant,#1B5E20)';
    avatarIcon = SmartToyIcon({ fontSize: 'small', color: 'inherit' }).el;
    avatarLabel = t('message.type.assistant');
  }

  avatarIcon.style.color = 'white';

  const { el: avatarEl } = createAvatar({
    children: avatarIcon,
    size: 'small',
    alt: avatarLabel,
    style: {
      width: '32px',
      height: '32px',
      flexShrink: '0',
      marginBottom: '4px',
      backgroundColor: avatarBgColor,
      color: 'white',
    },
  });

  // Bubble container
  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.style.cssText = 'max-width:75%;min-width:60px;';

  // Bubble
  const bubble = document.createElement('div');
  const bubbleBg = isUser
    ? 'var(--trv-color-ice-blue-subtle,#0d2137)'
    : 'var(--trv-color-charcoal,#1a2035)';
  const bubbleBorder = isUser
    ? '1px solid var(--trv-color-ice-blue-border,#1e4976)'
    : '1px solid var(--am-color-divider)';
  bubble.style.cssText =
    `background-color:${bubbleBg};` +
    `color:var(--am-color-text-primary);` +
    `border:${bubbleBorder};` +
    `padding:8px 12px;` +
    `border-radius:12px;` +
    (isUser ? 'border-top-right-radius:0;' : 'border-top-left-radius:0;');
  bubbleWrapper.appendChild(bubble);

  // Text content
  const toolCallHandles: ToolCallEntryHandle[] = [];

  if (hasTextContent) {
    let textExpanded = false;

    const textWrap = document.createElement('div');

    const textClip = document.createElement('div');
    textClip.style.cssText = needsCollapse
      ? `max-height:${COLLAPSED_MAX_HEIGHT}px;overflow:hidden;`
      : '';

    const textEl = document.createElement('p');
    textEl.style.cssText =
      'margin:0;white-space:pre-wrap;word-break:break-word;font-size:0.85rem;';
    textEl.textContent = textContent;
    textClip.appendChild(textEl);
    textWrap.appendChild(textClip);

    if (needsCollapse) {
      const expandBtn = document.createElement('button');
      expandBtn.style.cssText =
        'display:flex;align-items:center;justify-content:center;' +
        'border:none;background:none;cursor:pointer;padding:2px;border-radius:50%;' +
        'color:var(--am-color-text-secondary);transition:transform 0.2s;';
      expandBtn.setAttribute('aria-label', t('message.expand'));

      const expandIcon = ExpandMoreIcon({ fontSize: 'small' }).el;
      expandBtn.appendChild(expandIcon);
      textWrap.appendChild(expandBtn);

      expandBtn.addEventListener('click', () => {
        textExpanded = !textExpanded;
        textClip.style.maxHeight = textExpanded ? 'none' : `${COLLAPSED_MAX_HEIGHT}px`;
        expandIcon.style.transform = textExpanded ? 'rotate(180deg)' : 'none';
        expandBtn.setAttribute(
          'aria-label',
          textExpanded ? t('message.collapse') : t('message.expand'),
        );
      });
    }

    bubble.appendChild(textWrap);
  }

  // Tool calls
  if (hasToolCalls && message.toolCalls) {
    for (const tc of message.toolCalls) {
      const handle = createToolCallEntry(tc, message.triggerCommitHashes, t);
      toolCallHandles.push(handle);
      bubble.appendChild(handle.el);
    }
  }

  // Commit chips below bubble
  if (message.triggerCommitHashes && message.triggerCommitHashes.length > 0) {
    const chipsRow = document.createElement('div');
    chipsRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;';

    for (const hash of message.triggerCommitHashes) {
      const iconEl = CommitIcon({ fontSize: 14 }).el;
      iconEl.style.marginRight = '2px';
      iconEl.style.flexShrink = '0';

      const { el: chip } = createChip({
        label: `#${hash.slice(0, 7)}`,
        size: 'small',
        variant: 'outlined',
      });
      chip.style.cssText +=
        'height:20px;font-size:0.7rem;' +
        'color:var(--trv-color-ice-blue,#64b5f6);' +
        'border-color:var(--trv-color-ice-blue,#64b5f6);' +
        'background-color:transparent;';
      chip.setAttribute('aria-label', `commit ${hash}`);
      chip.insertBefore(iconEl, chip.firstChild);
      chipsRow.appendChild(chip);
    }

    bubbleWrapper.appendChild(chipsRow);
  }

  // Root row
  const root = document.createElement('div');
  root.setAttribute('data-message-uuid', message.uuid);
  root.style.cssText =
    'display:flex;' +
    `flex-direction:${isUser ? 'row-reverse' : 'row'};` +
    'align-items:flex-end;gap:8px;padding:4px 8px;' +
    (message.isSidechain
      ? 'border-left:2px dashed var(--am-color-divider);'
      : '');

  root.appendChild(avatarEl);
  root.appendChild(bubbleWrapper);

  return { root, toolCallHandles };
}

export function mountMessageNode(
  container: HTMLElement,
  initial: MessageNodeProps,
): VanillaViewHandle<MessageNodeProps> {
  let current = buildMessage(initial);

  if (current.root) container.appendChild(current.root);

  return {
    update(next) {
      // Destroy old tool call entries
      for (const h of current.toolCallHandles) h.destroy();

      const next_ = buildMessage(next);

      if (current.root && next_.root) {
        container.replaceChild(next_.root, current.root);
      } else if (current.root && !next_.root) {
        current.root.remove();
      } else if (!current.root && next_.root) {
        container.appendChild(next_.root);
      }

      current = next_;
    },
    destroy() {
      for (const h of current.toolCallHandles) h.destroy();
      current.root?.remove();
    },
  };
}
