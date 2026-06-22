/**
 * logs テーブルの vanilla 版（`components/logs/LogsTable.tsx` の素 DOM 等価）。
 *
 * 等幅フォントの行グリッド（時刻/level chip/source/component/message/detail dot）を描画し、
 * 行クリックで onSelect、autoScroll 有効時は末尾へスクロールする。
 */
import { createChip } from '@anytime-markdown/ui-core';
import type { LogEntry, LogLevel } from '../../c4/hooks/c4WsMessages';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

// chip のアウトライン色（MUI Chip color="error|warning|info|default" 相当を CSS 変数で再現）。
const LEVEL_CHIP_COLOR: Record<LogLevel, string> = {
  error: 'var(--am-color-error-main)',
  warn: 'var(--am-color-warning-main)',
  info: 'var(--am-color-info-main, var(--am-color-text-secondary))',
  debug: 'var(--am-color-text-secondary)',
};

export interface LogsTableProps {
  logs: ReadonlyArray<LogEntry>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  autoScroll: boolean;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function levelColorVar(level: LogLevel): string {
  if (level === 'error') return 'var(--am-color-error-main)';
  if (level === 'warn') return 'var(--am-color-warning-main)';
  return 'var(--am-color-text-primary)';
}

function cell(text: string, css: string, title?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = css;
  el.textContent = text;
  if (title) el.title = title;
  return el;
}

export function mountLogsTable(
  container: HTMLElement,
  initial: LogsTableProps,
): VanillaViewHandle<LogsTableProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'flex:1;overflow:auto;font-family:monospace;font-size:12px;';
  root.setAttribute('role', 'grid');
  root.setAttribute('aria-label', 'logs');
  const tail = document.createElement('div');

  const render = (): void => {
    root.replaceChildren();
    for (const log of props.logs) {
      const hasDetail = log.metadata != null || log.stack != null;
      const isSelected = props.selectedId === log.id;
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.setAttribute('aria-rowindex', String(log.id));
      row.setAttribute('aria-selected', String(isSelected));
      row.style.cssText =
        'display:grid;grid-template-columns:180px 64px 80px 140px 1fr 16px;' +
        'gap:8px;padding:2px 8px;cursor:pointer;' +
        `background-color:${isSelected ? 'var(--am-color-action-selected)' : 'transparent'};` +
        `color:${levelColorVar(log.level)};`;
      row.addEventListener('click', () => props.onSelect(log.id));
      row.addEventListener('mouseenter', () => {
        if (!isSelected) row.style.backgroundColor = 'var(--am-color-action-hover)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = isSelected ? 'var(--am-color-action-selected)' : 'transparent';
      });

      row.appendChild(cell(formatTime(log.timestamp), 'white-space:nowrap;', log.timestamp));

      const { el: chip } = createChip({
        size: 'small',
        label: log.level,
        variant: 'outlined',
      });
      chip.style.height = '18px';
      chip.style.fontSize = '10px';
      chip.style.color = LEVEL_CHIP_COLOR[log.level];
      chip.style.borderColor = LEVEL_CHIP_COLOR[log.level];
      const chipWrap = document.createElement('div');
      chipWrap.appendChild(chip);
      row.appendChild(chipWrap);

      row.appendChild(cell(log.source === 'extension' ? 'ext' : 'daemon', ''));
      row.appendChild(
        cell(log.component, 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', log.component),
      );
      row.appendChild(
        cell(log.message, 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', log.message),
      );
      row.appendChild(cell('●', `opacity:${hasDetail ? 0.5 : 0};text-align:center;`));
      root.appendChild(row);
    }
    root.appendChild(tail);
    // jsdom 等 scrollIntoView 未実装環境ではスキップ。
    if (props.autoScroll && typeof tail.scrollIntoView === 'function') {
      tail.scrollIntoView({ block: 'end' });
    }
  };
  render();
  container.appendChild(root);

  let prevLen = props.logs.length;
  return {
    update(next) {
      const lenChanged = next.logs.length !== prevLen;
      props = next;
      render();
      prevLen = next.logs.length;
      void lenChanged;
    },
    destroy() {
      root.remove();
    },
  };
}
