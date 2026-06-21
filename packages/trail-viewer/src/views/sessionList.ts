/**
 * SessionList の vanilla 版（`components/SessionList.tsx` の素 DOM 等価）。
 *
 * セッション一覧を dense リスト行で表示する。各行は選択状態・コピーボタン・チップを持つ。
 * selected 状態・copiedId のローカル状態はこの view 内で保持する（React useState 相当）。
 */
import {
  createListItemButton,
  createChip,
  createIconButton,
  createTooltip,
  ContentCopy,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import { formatLocalDateTime } from '@anytime-markdown/trail-core/formatDate';
import type { TrailSession } from '../domain/parser/types';

export interface SessionListProps {
  readonly t: (key: string) => string;
  readonly sessions: readonly TrailSession[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  /** colors from TrailThemeContext */
  readonly colors: {
    readonly textSecondary: string;
    readonly iceBlue: string;
  };
}

function formatSessionLabel(session: TrailSession): string {
  return session.slug || session.id.slice(0, 8);
}

function formatSessionDate(startTime: string): string {
  return formatLocalDateTime(startTime);
}

/** 行のリソース（tooltip / iconButton の destroy ハンドル）を表す型。 */
interface RowHandle {
  itemBtn: { el: HTMLElement; destroy: () => void };
  copyBtn: { el: HTMLElement; update: (opts: { ariaLabel?: string }) => void; destroy: () => void };
  tooltip: { el: HTMLElement; update: (opts: { title: string }) => void; destroy: () => void };
}

export function mountSessionList(
  container: HTMLElement,
  initial: SessionListProps,
): VanillaViewHandle<SessionListProps> {
  let props = initial;
  let copiedId: string | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const root = document.createElement('ul');
  root.setAttribute('role', 'list');
  root.style.cssText = 'list-style:none;margin:0;padding:0;';
  container.appendChild(root);

  // Track per-row handles for cleanup
  let rowHandles: RowHandle[] = [];

  function buildRows(): void {
    // Destroy previous row handles
    for (const h of rowHandles) {
      h.tooltip.destroy();
      h.copyBtn.destroy();
      h.itemBtn.destroy();
    }
    rowHandles = [];
    root.replaceChildren();

    if (props.sessions.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;';
      const text = document.createElement('span');
      text.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};padding:16px;display:block;`;
      text.textContent = props.t('sessionList.noSessions');
      empty.appendChild(text);
      root.appendChild(empty);
      return;
    }

    for (const session of props.sessions) {
      const li = document.createElement('li');

      // Primary line: label + copy button
      const primaryRow = document.createElement('span');
      primaryRow.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;';

      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = `font-size:0.875rem;font-weight:${session.id === props.selectedId ? 600 : 400};`;
      labelSpan.textContent = formatSessionLabel(session);
      primaryRow.appendChild(labelSpan);

      const copyIconEl = ContentCopy({ fontSize: 14 }).el;
      const copyBtn = createIconButton({
        size: 'small',
        ariaLabel: props.t('sessionList.copyId'),
        children: copyIconEl,
        onClick: () => {
          if (destroyed) return;
          void navigator.clipboard.writeText(session.id).then(() => {
            if (destroyed) return;
            copiedId = session.id;
            buildRows();
            if (copyTimer !== null) clearTimeout(copyTimer);
            copyTimer = setTimeout(() => {
              if (destroyed) return;
              copiedId = null;
              buildRows();
            }, 2000);
          });
        },
      });
      copyBtn.el.style.color = props.colors.textSecondary;
      copyBtn.el.style.padding = '4px';

      const tooltip = createTooltip({
        reference: copyBtn.el,
        title: copiedId === session.id ? props.t('sessionList.copied') : props.t('sessionList.copyId'),
      });

      primaryRow.appendChild(copyBtn.el);

      // Secondary block: id (if slug), branch·date, chips
      const secondary = document.createElement('div');
      secondary.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

      if (session.slug) {
        const idSpan = document.createElement('span');
        idSpan.style.cssText = `font-size:0.75rem;color:${props.colors.textSecondary};font-family:monospace;`;
        idSpan.textContent = session.id.slice(0, 8);
        secondary.appendChild(idSpan);
      }

      const metaSpan = document.createElement('span');
      metaSpan.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      metaSpan.textContent = `${session.gitBranch ?? ''} · ${formatSessionDate(session.startTime)}`;
      secondary.appendChild(metaSpan);

      const chipsRow = document.createElement('span');
      chipsRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';

      const chipDefs: Array<{ label: string; show?: boolean }> = [
        { label: session.source ?? 'claude_code' },
        { label: `${session.messageCount} ${props.t('sessionList.messages')}` },
        ...(session.errorCount != null && session.errorCount > 0
          ? [{ label: `${session.errorCount} errors` }]
          : []),
        ...(session.subAgentCount != null && session.subAgentCount > 0
          ? [{ label: `${session.subAgentCount} ${props.t('sessionList.subAgents')}` }]
          : []),
      ];

      for (const c of chipDefs) {
        const { el } = createChip({ label: c.label, size: 'small', variant: 'outlined' });
        el.style.height = '20px';
        el.style.fontSize = '0.7rem';
        el.style.borderColor = props.colors.iceBlue;
        chipsRow.appendChild(el);
      }

      secondary.appendChild(chipsRow);

      // Assemble list item
      const content = document.createElement('div');
      content.appendChild(primaryRow);
      content.appendChild(secondary);

      const itemBtn = createListItemButton({
        selected: session.id === props.selectedId,
        children: content,
        testId: 'session-row',
        style: { alignItems: 'flex-start', paddingRight: '8px' },
        onClick: () => {
          if (destroyed) return;
          props.onSelect(session.id);
        },
      });

      li.appendChild(itemBtn.el);
      root.appendChild(li);

      rowHandles.push({ itemBtn, copyBtn, tooltip });
    }
  }

  buildRows();

  return {
    update(next: SessionListProps) {
      // 進行中の copy 表示タイマーをクリアし、update 後の二重再描画を防ぐ。
      if (copyTimer !== null) {
        clearTimeout(copyTimer);
        copyTimer = null;
        copiedId = null;
      }
      props = next;
      buildRows();
    },
    destroy() {
      destroyed = true;
      if (copyTimer !== null) clearTimeout(copyTimer);
      for (const h of rowHandles) {
        h.tooltip.destroy();
        h.copyBtn.destroy();
        h.itemBtn.destroy();
      }
      rowHandles = [];
      root.remove();
    },
  };
}
