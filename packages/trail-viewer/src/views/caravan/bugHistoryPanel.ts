/**
 * BugHistory パネル（Flight Record の Bug Fixed サブタブの中身）。
 *
 * 2026-08-05 に Memory の Bugs サブタブから Flight Record へ移設した。パネル実体は複製せず
 * マウント元だけを移したため、ファイルは `views/caravan/` に残っている（データ源が trail-caravan-book
 * であることは変わらない）。React ラッパ `components/caravan/BugHistoryPanel.tsx` は消費者が
 * 無くなったため同日に削除した。
 *
 * - Recurring bugs チップ帯（上部）
 * - Package / Category フィルタバー
 * - バグ一覧テーブル（左ペイン） + BugCausalPanel（右ペイン）の左右分割レイアウト
 *
 * データ取得はこのモジュール内で行い（reader.listRecurringBugs / getBugHistory）、
 * フィルタリングはローカル状態で保持する。
 * selectedBugEntityId は presentational な選択状態としてここで保持する。
 */
import { createChip, createSelect, createTooltip } from '@anytime-markdown/ui-core';
import type { CaravanBugHistoryRow, CaravanRecurringBugRow } from '../../data/types';
import type { CaravanReader } from '../../data/readers/CaravanReader';
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
  reader: CaravanReader | null;
  onOpenPrecedingReviews?: (findingIds: readonly string[]) => void;
  onOpenSiblingBugs?: (bugEntityIds: readonly string[]) => void;
  /** instructionId → 一覧に出す指示名。未配線ならセル自体を出さない（生 ID を見せない）。 */
  labelOf?: (instructionId: string) => string;
  /** 指示名クリックで指示タブへ移り、その指示を選択状態にする（Review タブの行クリックと同じ）。 */
  onSelectInstruction?: (instructionId: string) => void;
  pendingBugFilter?: { bugEntityIds: readonly string[] } | null;
  /**
   * ワークスペース（repo_name）でバグ履歴・再発クラスタを絞る。空文字は「すべて」。
   *
   * サーバー側で絞るのは、取得の上限が絞り込み前に効くと、選んだワークスペースのバグが
   * 窓から溢れて「0 件」に見えるため。
   */
  workspace: string;
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
  /**
   * 取得の世代。reader の同一性では足りない — reader は serverUrl 変更でしか作り直されず、
   * ワークスペースを続けて切り替えると同じ reader のまま複数本走る。
   */
  let loadSeq = 0;
  let recurring: readonly CaravanRecurringBugRow[] = [];
  let history: readonly CaravanBugHistoryRow[] = [];
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
    ariaLabel: props.t('flightRecord.bugfix.filterPackage'),
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
    ariaLabel: props.t('flightRecord.bugfix.filterCategory'),
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
    label.textContent = props.t('flightRecord.bugfix.recurring');
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    for (const r of recurring.slice(0, 10)) {
      const colorVar = CATEGORY_COLOR_VAR[r.driftType] ?? 'var(--am-color-text-secondary)';
      chips.appendChild(styledChip(r.subjectDisplayName || r.subjectEntityId, colorVar));
    }
    recurringSection.append(label, chips);
  }

  function filteredHistory(): readonly CaravanBugHistoryRow[] {
    const pendingIds = props.pendingBugFilter?.bugEntityIds ?? null;
    return history.filter((r) => {
      if (pendingIds && !pendingIds.includes(r.bugEntityId)) return false;
      if (pkgFilter && r.package !== pkgFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      return true;
    });
  }

  const rowHandles: Array<{ destroy(): void }> = [];

  /**
   * 指示名セル。押すと指示タブへ移りその指示を選択する（Review タブの行クリックと同じ）。
   *
   * 遷移先の配線（`onSelectInstruction`）と表示名の解決（`labelOf`）が両方揃ったときだけ
   * ボタンを出す。片方でも欠けたら押せないボタンや生の指示 ID を見せず、セルを空にする。
   */
  function instructionButton(instructionId: string | null): HTMLButtonElement | null {
    const { labelOf, onSelectInstruction } = props;
    if (!instructionId) return null;
    if (labelOf === undefined || onSelectInstruction === undefined) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['amBugInstruction'] = instructionId;
    // UA 既定（buttonface 背景・2px ボーダー・中央寄せ）を打ち消す。`all:unset` は
    // フォーカスリングまで消してキーボード操作を見えなくするので、個別に上書きする。
    button.style.cssText =
      'display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'background:none;border:none;padding:0;margin:0;font:inherit;font-size:0.75rem;' +
      'text-align:left;cursor:pointer;color:var(--am-color-primary-main);text-decoration:underline;';
    button.textContent = labelOf(instructionId);
    button.addEventListener('click', (e) => {
      // 行クリック（バグ選択・因果ペイン更新）へは伝播させない
      e.stopPropagation();
      onSelectInstruction(instructionId);
    });
    return button;
  }

  function renderTable(): void {
    for (const h of rowHandles) h.destroy();
    rowHandles.length = 0;
    tablePane.replaceChildren();

    const rows = filteredHistory();
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:24px;display:flex;align-items:center;justify-content:center;color:var(--am-color-text-secondary);font-size:0.875rem;';
      empty.textContent = props.t('flightRecord.bugfix.empty');
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
      th(props.t('flightRecord.bugfix.column.summary')),
      th(props.t('flightRecord.bugfix.column.date')),
      th(props.t('flightRecord.bugfix.column.category')),
      th(props.t('flightRecord.column.instruction')),
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

      // Summary
      const summaryCell = td('max-width:280px;color:var(--am-color-text-primary);overflow:hidden;');
      const summaryInner = document.createElement('div');
      summaryInner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.75rem;';
      summaryInner.textContent = row.subjectSummary;
      summaryCell.appendChild(summaryInner);

      // Date
      const dateCell = td('color:var(--am-color-text-secondary);white-space:nowrap;');
      dateCell.textContent = row.committedAt.slice(0, 10);

      // Category chip
      const catCell = td();
      const catColorVar = CATEGORY_COLOR_VAR[row.category] ?? 'var(--am-color-text-secondary)';
      catCell.appendChild(styledChip(row.category, catColorVar));

      // 指示名（クリックで指示タブへ遷移してその指示を選択）
      const instructionCell = td('max-width:220px;overflow:hidden;');
      const instructionCellContent = instructionButton(row.instructionId);
      if (instructionCellContent !== null) instructionCell.appendChild(instructionCellContent);

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
          title: `${props.t('flightRecord.bugfix.precededByCount')}: ${row.precededByFindingIds.length}`,
        });
        rowHandles.push(precededTooltip);
        precededCell.appendChild(precededChip);
      }

      tr.append(summaryCell, dateCell, catCell, instructionCell, precededCell);
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
    filterLabel.textContent = props.t('flightRecord.bugfix.history');
    causalTitle.textContent = props.t('flightRecord.bugfix.causedBy.title');

    if (!props.reader) {
      root.style.display = 'flex';
      root.style.alignItems = 'center';
      root.style.justifyContent = 'center';
      root.replaceChildren();
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
      empty.textContent = props.t('flightRecord.bugfix.empty');
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
    const seq = ++loadSeq;
    void Promise.all([
      props.reader.listRecurringBugs({ workspace: props.workspace }),
      props.reader.getBugHistory({ workspace: props.workspace }),
    ]).then(([rec, hist]) => {
      // 取得中に接続先・絞り込みが差し替わったら旧世代の応答は捨てる。
      // reader の同一性で判定すると、reader が変わらないワークスペース切替を取りこぼす。
      if (seq !== loadSeq || destroyed) return;
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
      const workspaceChanged = next.workspace !== props.workspace;
      props = next;
      if (readerChanged || workspaceChanged) {
        // 絞り込みが変わったら取り直す。前の結果を残すと「別のワークスペースの行」を
        // 今の選択の結果として見せることになる。
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
