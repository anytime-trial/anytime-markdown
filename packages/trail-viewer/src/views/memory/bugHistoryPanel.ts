/**
 * BugHistory パネルの vanilla 版（`components/memory/BugHistoryPanel.tsx` の素 DOM 等価）。
 *
 * - Recurring bugs チップ帯（上部）
 * - Package / Category フィルタバー
 * - バグ一覧テーブル（左ペイン） + BugCausalPanel（右ペイン）の左右分割レイアウト
 *
 * データ取得はこのモジュール内で行い（reader.listRecurringBugs / getBugHistory）、
 * フィルタリングはローカル状態で保持する。
 * selectedBugEntityId は presentational な選択状態としてここで保持する。
 */
import {
  createChip,
  createIconButton,
  createSelect,
  createTooltip,
  OpenInNew,
} from '@anytime-markdown/ui-core';
import type { MemoryBugHistoryRow, MemoryRecurringBugRow } from '../../data/types';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountBugCausalPanel } from './bugCausalPanel';

// MUI Chip color → CSS 変数マッピング
const CATEGORY_COLOR_VAR: Record<string, string> = {
  regression: 'var(--am-color-error-main)',
  spec: 'var(--am-color-info-main)',
  logic: 'var(--am-color-warning-main)',
  typo: 'var(--am-color-text-secondary)',
  deps: 'var(--am-color-text-secondary)',
};

export interface BugHistoryPanelProps {
  t: (key: string) => string;
  reader: MemoryReader | null;
  onOpenSessionMessages?: (sessionId: string) => void;
  onOpenPrecedingReviews?: (findingIds: readonly string[]) => void;
  onOpenSiblingBugs?: (bugEntityIds: readonly string[]) => void;
  pendingBugFilter?: { bugEntityIds: readonly string[] } | null;
}

/** chip を色付きボーダー（outlined 風）で装飾するヘルパー。 */
function styledChip(label: string, colorVar: string, onClick?: () => void): HTMLElement {
  const { el } = createChip({ label, size: 'small', onClick });
  el.style.outline = `1px solid ${colorVar}`;
  el.style.color = colorVar;
  return el;
}

/** th 要素を生成するヘルパー。 */
function th(text: string): HTMLTableCellElement {
  const el = document.createElement('th');
  el.scope = 'col';
  el.style.cssText =
    'padding:4px 8px;font-size:0.7rem;font-weight:600;color:var(--am-color-text-secondary);' +
    'border-bottom:1px solid var(--am-color-divider);background:var(--am-color-bg-paper);' +
    'white-space:nowrap;text-align:left;position:sticky;top:0;z-index:1;';
  el.textContent = text;
  return el;
}

/** td 要素を生成するヘルパー。 */
function td(css = ''): HTMLTableCellElement {
  const el = document.createElement('td');
  el.style.cssText = `padding:4px 8px;font-size:0.7rem;border-bottom:1px solid var(--am-color-divider);${css}`;
  return el;
}

export function mountBugHistoryPanel(
  container: HTMLElement,
  initial: BugHistoryPanelProps,
): VanillaViewHandle<BugHistoryPanelProps> {
  let props = initial;
  let destroyed = false;
  let recurring: readonly MemoryRecurringBugRow[] = [];
  let history: readonly MemoryBugHistoryRow[] = [];
  let pkgFilter = '';
  let categoryFilter = '';
  let selectedBugEntityId: string | null = null;

  // --- root 構造 ---
  const root = document.createElement('div');
  root.setAttribute('aria-label', 'bug-history');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
  container.appendChild(root);

  // Recurring section
  const recurringSection = document.createElement('div');
  recurringSection.style.cssText =
    'padding:8px 16px;border-bottom:1px solid var(--am-color-divider);';
  recurringSection.setAttribute('aria-label', 'recurring-bugs');

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.style.cssText =
    'padding:8px 16px;display:flex;gap:16px;align-items:center;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';

  const filterLabel = document.createElement('span');
  filterLabel.style.cssText = 'font-size:0.75rem;font-weight:600;color:var(--am-color-text-secondary);';

  // pkg select
  const pkgSelectWrap = document.createElement('div');
  pkgSelectWrap.style.cssText = 'min-width:140px;';
  const pkgSelect = createSelect<string>({
    value: '',
    options: [{ value: '', label: 'All' }],
    ariaLabel: props.t('memory.bug.filterPackage'),
    onChange: (v) => {
      pkgFilter = v;
      renderTable();
    },
  });
  pkgSelectWrap.appendChild(pkgSelect.el);

  // category select
  const catSelectWrap = document.createElement('div');
  catSelectWrap.style.cssText = 'min-width:120px;';
  const catSelect = createSelect<string>({
    value: '',
    options: [{ value: '', label: 'All' }],
    ariaLabel: props.t('memory.bug.filterCategory'),
    onChange: (v) => {
      categoryFilter = v;
      renderTable();
    },
  });
  catSelectWrap.appendChild(catSelect.el);

  filterBar.append(filterLabel, pkgSelectWrap, catSelectWrap);

  // Main content area
  const mainContent = document.createElement('div');
  mainContent.style.cssText = 'flex:1;display:flex;overflow:hidden;';

  // Left: table pane
  const tablePane = document.createElement('div');
  tablePane.style.cssText = 'flex:1;overflow:auto;';

  // Right: causal pane
  const causalPane = document.createElement('div');
  causalPane.style.cssText =
    'width:280px;flex-shrink:0;border-left:1px solid var(--am-color-divider);display:flex;flex-direction:column;overflow:hidden;';

  const causalTitle = document.createElement('div');
  causalTitle.style.cssText =
    'font-size:0.75rem;color:var(--am-color-text-secondary);padding:6px 12px;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';

  const causalBody = document.createElement('div');
  causalBody.style.cssText = 'flex:1;overflow:hidden;';
  causalPane.append(causalTitle, causalBody);

  mainContent.append(tablePane, causalPane);
  root.append(recurringSection, filterBar, mainContent);

  // Mount causal panel (will update on row selection)
  const causal = mountBugCausalPanel(causalBody, {
    t: props.t,
    reader: props.reader,
    bugEntityId: null,
    onOpenPrecedingReviews: props.onOpenPrecedingReviews,
    onOpenSiblingBugs: props.onOpenSiblingBugs,
  });

  // --- render helpers ---

  function renderRecurring(): void {
    recurringSection.replaceChildren();
    if (recurring.length === 0) {
      recurringSection.style.display = 'none';
      return;
    }
    recurringSection.style.display = '';
    const label = document.createElement('div');
    label.style.cssText =
      'font-size:0.75rem;font-weight:600;color:var(--am-color-text-secondary);margin-bottom:4px;';
    label.textContent = props.t('memory.bug.recurring');
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    for (const r of recurring.slice(0, 10)) {
      const colorVar = CATEGORY_COLOR_VAR[r.driftType] ?? 'var(--am-color-text-secondary)';
      chips.appendChild(styledChip(r.subjectDisplayName || r.subjectEntityId, colorVar));
    }
    recurringSection.append(label, chips);
  }

  function filteredHistory(): readonly MemoryBugHistoryRow[] {
    const pendingIds = props.pendingBugFilter?.bugEntityIds ?? null;
    return history.filter((r) => {
      if (pendingIds && !pendingIds.includes(r.bugEntityId)) return false;
      if (pkgFilter && r.package !== pkgFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      return true;
    });
  }

  const rowHandles: Array<{ destroy(): void }> = [];

  function renderTable(): void {
    for (const h of rowHandles) h.destroy();
    rowHandles.length = 0;
    tablePane.replaceChildren();

    const rows = filteredHistory();
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:24px;display:flex;align-items:center;justify-content:center;color:var(--am-color-text-secondary);font-size:0.875rem;';
      empty.textContent = props.t('memory.bug.empty');
      empty.setAttribute('aria-label', 'bug-history-empty');
      tablePane.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;';
    table.setAttribute('aria-label', 'bug-history-table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(
      th('Package'),
      th('Category'),
      th('Commit'),
      th('Summary'),
      th('Date'),
      th(''),
      th(''),
    );
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.style.cssText =
        'cursor:pointer;transition:background-color 0.1s;';
      tr.setAttribute('aria-selected', String(selectedBugEntityId === row.bugEntityId));
      tr.setAttribute('data-bug-id', row.bugEntityId);

      if (selectedBugEntityId === row.bugEntityId) {
        tr.style.backgroundColor = 'var(--am-color-action-selected)';
      }

      tr.addEventListener('mouseover', () => {
        if (selectedBugEntityId !== row.bugEntityId) {
          tr.style.backgroundColor = 'var(--am-color-action-hover)';
        }
      });
      tr.addEventListener('mouseout', () => {
        if (selectedBugEntityId !== row.bugEntityId) {
          tr.style.backgroundColor = '';
        }
      });
      tr.addEventListener('click', () => {
        selectedBugEntityId = selectedBugEntityId === row.bugEntityId ? null : row.bugEntityId;
        causal.update({
          t: props.t,
          reader: props.reader,
          bugEntityId: selectedBugEntityId,
          onOpenPrecedingReviews: props.onOpenPrecedingReviews,
          onOpenSiblingBugs: props.onOpenSiblingBugs,
        });
        renderTable();
      });

      // Package
      const pkgCell = td('color:var(--am-color-text-secondary);');
      pkgCell.textContent = row.package;

      // Category chip
      const catCell = td();
      const catColorVar = CATEGORY_COLOR_VAR[row.category] ?? 'var(--am-color-text-secondary)';
      catCell.appendChild(styledChip(row.category, catColorVar));

      // Commit SHA
      const shaCell = td('color:var(--am-color-text-secondary);font-family:monospace;');
      shaCell.textContent = row.commitSha.slice(0, 7);

      // Summary
      const summaryCell = td('max-width:280px;color:var(--am-color-text-primary);overflow:hidden;');
      const summaryInner = document.createElement('div');
      summaryInner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.75rem;';
      summaryInner.textContent = row.subjectSummary;
      summaryCell.appendChild(summaryInner);

      // Date
      const dateCell = td('color:var(--am-color-text-secondary);white-space:nowrap;');
      dateCell.textContent = row.committedAt.slice(0, 10);

      // Open in messages icon button
      const openCell = td('padding:2px 4px;text-align:right;');
      if (props.onOpenSessionMessages && row.sessionId) {
        const iconBtnHandle = createIconButton({
          size: 'small',
          ariaLabel: props.t('memory.bug.openInMessages'),
          onClick: (e?: MouseEvent) => {
            e?.stopPropagation();
            props.onOpenSessionMessages!(row.sessionId!);
          },
        });
        rowHandles.push(iconBtnHandle);
        const { el: iconBtn } = iconBtnHandle;
        const { el: icon } = OpenInNew({ fontSize: 'small', color: 'action' });
        iconBtn.appendChild(icon);
        const tooltipHandle = createTooltip({ reference: iconBtn, title: props.t('memory.bug.openInMessages') });
        rowHandles.push(tooltipHandle);
        openCell.appendChild(iconBtn);
      }

      // Preceded by chip
      const precededCell = td('padding:2px 4px;text-align:right;white-space:nowrap;');
      if (row.precededByFindingIds.length > 0) {
        const precededChip = styledChip(
          `↩ ${row.precededByFindingIds.length}`,
          'var(--am-color-info-main)',
          props.onOpenPrecedingReviews
            ? (e?: Event) => {
                (e as MouseEvent | undefined)?.stopPropagation?.();
                props.onOpenPrecedingReviews!(row.precededByFindingIds);
              }
            : undefined,
        );
        const precededTooltip = createTooltip({
          reference: precededChip as HTMLElement,
          title: `${props.t('memory.bug.precededByCount')}: ${row.precededByFindingIds.length}`,
        });
        rowHandles.push(precededTooltip);
        precededCell.appendChild(precededChip);
      }

      tr.append(pkgCell, catCell, shaCell, summaryCell, dateCell, openCell, precededCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tablePane.appendChild(table);
  }

  function updateFilterOptions(): void {
    const packages = [...new Set(history.map((r) => r.package))].sort();
    const categories = [...new Set(history.map((r) => r.category))].sort();

    pkgSelect.update({
      options: [{ value: '', label: 'All' }, ...packages.map((p) => ({ value: p, label: p }))],
      value: pkgFilter,
    });
    catSelect.update({
      options: [{ value: '', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))],
      value: categoryFilter,
    });
  }

  function renderAll(): void {
    filterLabel.textContent = props.t('memory.bug.history');
    causalTitle.textContent = props.t('memory.bug.causedBy.title');

    if (!props.reader) {
      root.style.display = 'flex';
      root.style.alignItems = 'center';
      root.style.justifyContent = 'center';
      root.replaceChildren();
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
      empty.textContent = props.t('memory.bug.empty');
      root.appendChild(empty);
      return;
    }

    // Restore layout if reader is present
    root.style.alignItems = '';
    root.style.justifyContent = '';
    if (!root.contains(recurringSection)) {
      root.replaceChildren();
      root.append(recurringSection, filterBar, mainContent);
    }

    renderRecurring();
    updateFilterOptions();
    renderTable();
  }

  // Initial data load
  function load(): void {
    if (!props.reader) {
      renderAll();
      return;
    }
    void Promise.all([
      props.reader.listRecurringBugs({}),
      props.reader.getBugHistory({}),
    ]).then(([rec, hist]) => {
      if (destroyed) return;
      recurring = rec;
      history = hist;
      renderAll();
    });
  }

  load();

  return {
    update(next) {
      const readerChanged = next.reader !== props.reader;
      props = next;
      if (readerChanged) {
        load();
      } else {
        renderAll();
        causal.update({
          t: props.t,
          reader: props.reader,
          bugEntityId: selectedBugEntityId,
          onOpenPrecedingReviews: props.onOpenPrecedingReviews,
          onOpenSiblingBugs: props.onOpenSiblingBugs,
        });
      }
    },
    destroy() {
      destroyed = true;
      for (const h of rowHandles) h.destroy();
      rowHandles.length = 0;
      pkgSelect.destroy();
      catSelect.destroy();
      causal.destroy();
      root.remove();
    },
  };
}
