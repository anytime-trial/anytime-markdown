/**
 * Review パネルの vanilla 版（`components/memory/ReviewPanel.tsx` の素 DOM 等価）。
 *
 * - Unaddressed findings サマリチップ帯（上部）
 * - Severity / Category / Status フィルタバー
 * - レビュー履歴テーブル
 *
 * データ取得はこのモジュール内で行い（reader.listUnaddressedReviewFindings / getReviewHistory）、
 * フィルタリングはローカル状態で保持する。
 */
import {
  createChip,
  createIconButton,
  createSelect,
  createTooltip,
  OpenInNew,
} from '@anytime-markdown/ui-core';
import type { MemoryReviewHistoryRow, MemoryUnaddressedReviewFindingRow } from '../../data/types';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

// MUI Chip color → CSS 変数マッピング
const SEVERITY_COLOR_VAR: Record<string, string> = {
  info: 'var(--am-color-info-main)',
  warn: 'var(--am-color-warning-main)',
  error: 'var(--am-color-error-main)',
};

export interface ReviewPanelProps {
  t: (key: string) => string;
  reader: MemoryReader | null;
  onOpenSessionMessages?: (sessionId: string) => void;
  onOpenPrecedingBugs?: (bugEntityIds: readonly string[]) => void;
  pendingReviewFilter?: { findingEntityIds: readonly string[] } | null;
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

function extractPackage(filePath: string | null): string {
  if (!filePath) return '—';
  const m = /^packages\/([^/]+)\//.exec(filePath);
  return m?.[1] ?? '—';
}

function formatReviewer(row: MemoryReviewHistoryRow): string {
  if (row.sourceKind === 'agent' || row.sourceKind === 'session') {
    return row.model ? `Claude Code (${row.model})` : 'Claude Code';
  }
  return row.reviewer.trim() || '—';
}

export function mountReviewPanel(
  container: HTMLElement,
  initial: ReviewPanelProps,
): VanillaViewHandle<ReviewPanelProps> {
  let props = initial;
  let destroyed = false;
  let unaddressed: readonly MemoryUnaddressedReviewFindingRow[] = [];
  let history: readonly MemoryReviewHistoryRow[] = [];
  let severityFilter = '';
  let categoryFilter = '';
  let statusFilter: '' | 'addressed' | 'notAddressed' = '';

  // --- root 構造 ---
  const root = document.createElement('div');
  root.setAttribute('aria-label', 'review-panel');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
  container.appendChild(root);

  // Unaddressed section
  const unaddressedSection = document.createElement('div');
  unaddressedSection.style.cssText =
    'padding:8px 16px;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.style.cssText =
    'padding:8px 16px;display:flex;gap:16px;align-items:center;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';

  const filterLabel = document.createElement('span');
  filterLabel.style.cssText = 'font-size:0.75rem;font-weight:600;color:var(--am-color-text-secondary);';

  // Severity select
  const sevSelectWrap = document.createElement('div');
  sevSelectWrap.style.cssText = 'min-width:120px;';
  const sevSelect = createSelect<string>({
    value: '',
    options: [
      { value: '', label: 'All' },
      { value: 'error', label: 'error' },
      { value: 'warn', label: 'warn' },
      { value: 'info', label: 'info' },
    ],
    ariaLabel: props.t('memory.review.filterSeverity'),
    onChange: (v) => {
      severityFilter = v;
      renderTable();
    },
  });
  sevSelectWrap.appendChild(sevSelect.el);

  // Category select
  const catSelectWrap = document.createElement('div');
  catSelectWrap.style.cssText = 'min-width:120px;';
  const catSelect = createSelect<string>({
    value: '',
    options: [{ value: '', label: 'All' }],
    ariaLabel: props.t('memory.review.filterCategory'),
    onChange: (v) => {
      categoryFilter = v;
      renderTable();
    },
  });
  catSelectWrap.appendChild(catSelect.el);

  // Status select
  const statusSelectWrap = document.createElement('div');
  statusSelectWrap.style.cssText = 'min-width:140px;';
  const statusSelect = createSelect<string>({
    value: '',
    options: [
      { value: '', label: 'All' },
      { value: 'addressed', label: props.t('memory.review.flow.addressed') },
      { value: 'notAddressed', label: props.t('memory.review.flow.notAddressed') },
    ],
    ariaLabel: props.t('memory.review.filterStatus'),
    onChange: (v) => {
      statusFilter = v as '' | 'addressed' | 'notAddressed';
      renderTable();
    },
  });
  statusSelectWrap.appendChild(statusSelect.el);

  filterBar.append(filterLabel, sevSelectWrap, catSelectWrap, statusSelectWrap);

  // Table pane
  const tablePane = document.createElement('div');
  tablePane.style.cssText = 'flex:1;overflow:auto;';

  root.append(unaddressedSection, filterBar, tablePane);

  // --- render helpers ---

  function renderUnaddressed(): void {
    unaddressedSection.replaceChildren();
    if (unaddressed.length === 0) {
      unaddressedSection.style.display = 'none';
      return;
    }
    unaddressedSection.style.display = '';
    const label = document.createElement('div');
    label.style.cssText =
      'font-size:0.75rem;font-weight:600;color:var(--am-color-text-secondary);margin-bottom:4px;';
    label.textContent = props.t('memory.review.unaddressed');
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';

    for (const sev of ['error', 'warn', 'info'] as const) {
      const count = unaddressed.filter((r) => r.severity === sev).length;
      if (count === 0) continue;
      const colorVar = SEVERITY_COLOR_VAR[sev] ?? 'var(--am-color-text-secondary)';
      chips.appendChild(styledChip(`${sev}: ${count}`, colorVar));
    }
    unaddressedSection.append(label, chips);
  }

  function filteredHistory(): readonly MemoryReviewHistoryRow[] {
    const pendingIds = props.pendingReviewFilter?.findingEntityIds ?? null;
    return history.filter((r) => {
      if (pendingIds && !pendingIds.includes(r.findingEntityId)) return false;
      if (severityFilter && r.severity !== severityFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (statusFilter === 'addressed' && !r.addressedCommitSha) return false;
      if (statusFilter === 'notAddressed' && r.addressedCommitSha) return false;
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
      empty.textContent = props.t('memory.review.empty');
      empty.setAttribute('aria-label', 'review-empty');
      tablePane.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;';
    table.setAttribute('aria-label', 'review-history-table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(
      th('File'),
      th('Package'),
      th('Category'),
      th('Severity'),
      th('Finding'),
      th('Status'),
      th('Reviewed'),
      th('Reviewer'),
      th(''),
      th(''),
    );
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-finding-id', row.findingEntityId);

      tr.addEventListener('mouseover', () => {
        tr.style.backgroundColor = 'var(--am-color-action-hover)';
      });
      tr.addEventListener('mouseout', () => {
        tr.style.backgroundColor = '';
      });

      // File (truncated basename with tooltip)
      const fileCell = td('max-width:140px;color:var(--am-color-text-secondary);overflow:hidden;');
      const fileInner = document.createElement('div');
      fileInner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      fileInner.textContent = row.targetFilePath?.split('/').at(-1) ?? '—';
      if (row.targetFilePath) {
        rowHandles.push(createTooltip({ reference: fileCell, title: row.targetFilePath, placement: 'top' }));
      }
      fileCell.appendChild(fileInner);

      // Package
      const pkgCell = td('color:var(--am-color-text-secondary);white-space:nowrap;');
      pkgCell.textContent = extractPackage(row.targetFilePath);

      // Category chip
      const catCell = td();
      const { el: catChip } = createChip({ label: row.category, size: 'small' });
      catChip.style.outline = '1px solid var(--am-color-divider)';
      catCell.appendChild(catChip);

      // Severity chip
      const sevCell = td();
      const sevColorVar = SEVERITY_COLOR_VAR[row.severity] ?? 'var(--am-color-text-secondary)';
      sevCell.appendChild(styledChip(row.severity, sevColorVar));

      // Finding text (truncated with tooltip)
      const findingCell = td('max-width:280px;color:var(--am-color-text-primary);overflow:hidden;');
      const findingInner = document.createElement('div');
      findingInner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.75rem;';
      findingInner.textContent = row.findingText;
      rowHandles.push(createTooltip({ reference: findingCell, title: row.findingText, placement: 'top' }));
      findingCell.appendChild(findingInner);

      // Status
      const statusCell = td('white-space:nowrap;');
      if (row.addressedCommitSha) {
        const col = document.createElement('div');
        col.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:2px;';
        col.appendChild(styledChip(props.t('memory.review.flow.addressed'), 'var(--am-color-success-main)'));
        if (row.addressedAt) {
          const dateEl = document.createElement('div');
          dateEl.style.cssText = 'font-size:0.65rem;color:var(--am-color-text-secondary);line-height:1;';
          dateEl.textContent = row.addressedAt.slice(0, 10);
          col.appendChild(dateEl);
        }
        statusCell.appendChild(col);
      } else {
        const { el: chip } = createChip({ label: props.t('memory.review.flow.notAddressed'), size: 'small' });
        chip.style.outline = '1px solid var(--am-color-divider)';
        statusCell.appendChild(chip);
      }

      // Reviewed date
      const reviewedCell = td('color:var(--am-color-text-secondary);white-space:nowrap;');
      reviewedCell.textContent = row.reviewedAt.slice(0, 10);

      // Reviewer (truncated with tooltip)
      const reviewerText = formatReviewer(row);
      const reviewerCell = td('max-width:160px;color:var(--am-color-text-secondary);overflow:hidden;');
      const reviewerInner = document.createElement('div');
      reviewerInner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.75rem;';
      reviewerInner.textContent = reviewerText;
      rowHandles.push(createTooltip({ reference: reviewerCell, title: reviewerText, placement: 'top' }));
      reviewerCell.appendChild(reviewerInner);

      // Open in messages icon button
      const openCell = td('padding:2px 4px;text-align:right;');
      if (props.onOpenSessionMessages && row.sessionId) {
        const iconBtnHandle = createIconButton({
          size: 'small',
          ariaLabel: props.t('memory.review.openInMessages'),
          onClick: (e?: MouseEvent) => {
            e?.stopPropagation();
            props.onOpenSessionMessages!(row.sessionId!);
          },
        });
        rowHandles.push(iconBtnHandle);
        const { el: iconBtn } = iconBtnHandle;
        const { el: icon } = OpenInNew({ fontSize: 'small', color: 'action' });
        iconBtn.appendChild(icon);
        rowHandles.push(createTooltip({ reference: iconBtn, title: props.t('memory.review.openInMessages') }));
        openCell.appendChild(iconBtn);
      }

      // Precedes bugs chip
      const precedesCell = td('padding:2px 4px;text-align:right;white-space:nowrap;');
      if (row.precedesBugEntityIds.length > 0) {
        const precedesChip = styledChip(
          `⚠ ${row.precedesBugEntityIds.length}`,
          'var(--am-color-warning-main)',
          props.onOpenPrecedingBugs
            ? (e?: Event) => {
                (e as MouseEvent | undefined)?.stopPropagation?.();
                props.onOpenPrecedingBugs!(row.precedesBugEntityIds);
              }
            : undefined,
        );
        rowHandles.push(createTooltip({
          reference: precedesChip as HTMLElement,
          title: `${props.t('memory.review.precedesBugCount')}: ${row.precedesBugEntityIds.length}`,
        }));
        precedesCell.appendChild(precedesChip);
      }

      tr.append(
        fileCell,
        pkgCell,
        catCell,
        sevCell,
        findingCell,
        statusCell,
        reviewedCell,
        reviewerCell,
        openCell,
        precedesCell,
      );
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tablePane.appendChild(table);
  }

  function updateCategoryOptions(): void {
    const categories = [...new Set(history.map((r) => r.category))].sort();
    catSelect.update({
      options: [{ value: '', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))],
      value: categoryFilter,
    });
  }

  function renderAll(): void {
    filterLabel.textContent = props.t('memory.review.history');

    if (!props.reader) {
      root.replaceChildren();
      root.style.alignItems = 'center';
      root.style.justifyContent = 'center';
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
      empty.textContent = props.t('memory.review.empty');
      root.appendChild(empty);
      return;
    }

    // Restore layout
    root.style.alignItems = '';
    root.style.justifyContent = '';
    if (!root.contains(unaddressedSection)) {
      root.replaceChildren();
      root.append(unaddressedSection, filterBar, tablePane);
    }

    renderUnaddressed();
    updateCategoryOptions();
    renderTable();
  }

  function load(): void {
    if (!props.reader) {
      renderAll();
      return;
    }
    void Promise.all([
      props.reader.listUnaddressedReviewFindings({ daysSinceMin: 30 }),
      props.reader.getReviewHistory({}),
    ]).then(([unad, hist]) => {
      if (destroyed) return;
      unaddressed = unad;
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
      }
    },
    destroy() {
      destroyed = true;
      for (const h of rowHandles) h.destroy();
      rowHandles.length = 0;
      sevSelect.destroy();
      catSelect.destroy();
      statusSelect.destroy();
      root.remove();
    },
  };
}
