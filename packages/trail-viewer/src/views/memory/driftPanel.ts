/**
 * DriftPanel の vanilla 版（`components/memory/DriftPanel.tsx` の素 DOM 等価）。
 *
 * フィルターツールバー・テーブル・DriftDetailDialog を縦に積む。
 * フィルター状態は presentational なローカル状態としてここで保持する。
 * データ取得（onResolve / onLoadDetail）は React シェルから props 経由で注入される。
 */
import {
  createButton,
  createChip,
  createSelect,
  createSwitch,
  createTooltip,
  HelpOutline,
} from '@anytime-markdown/ui-core';
import type { SelectOption } from '@anytime-markdown/ui-core';
import type { MemoryDriftEventRow } from '../../data/types';
import type { DriftHistoryPoint } from '@anytime-markdown/trail-core';
import { mountDriftHistoryChart } from './driftHistoryChart';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { computeFixTarget, filterDriftRows } from '../../components/memory/driftFilter';
import type { FixTarget } from '../../components/memory/driftFilter';
import { mountDriftDetailDialog, type DriftDetailDialogProps } from './driftDetailDialog';

// MUI Chip color → CSS 変数マッピング（severity）
const SEVERITY_COLOR_VAR: Record<string, string> = {
  info: 'var(--am-color-info-main)',
  warn: 'var(--am-color-warning-main)',
  error: 'var(--am-color-error-main)',
};

// MUI Chip color → CSS 変数マッピング（fix target）
const FIX_TARGET_COLOR_VAR: Record<FixTarget, string> = {
  code: 'var(--am-color-error-main)',
  spec: 'var(--am-color-warning-main)',
  conv: 'var(--am-color-text-secondary)',
};

const FIX_TARGET_I18N_KEYS: Record<FixTarget, string> = {
  code: 'memory.drift.fixTarget.code',
  spec: 'memory.drift.fixTarget.spec',
  conv: 'memory.drift.fixTarget.conv',
};

const DRIFT_TYPE_HELP_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['spec_vs_code', 'memory.drift.typeDescription.spec_vs_code'],
  ['conv_vs_code', 'memory.drift.typeDescription.conv_vs_code'],
  ['conv_vs_spec', 'memory.drift.typeDescription.conv_vs_spec'],
  ['three_way', 'memory.drift.typeDescription.three_way'],
  ['regression_cluster', 'memory.drift.typeDescription.regression_cluster'],
  ['spec_violation_cluster', 'memory.drift.typeDescription.spec_violation_cluster'],
  ['recurring_root_cause', 'memory.drift.typeDescription.recurring_root_cause'],
  ['review_unfixed', 'memory.drift.typeDescription.review_unfixed'],
  ['review_vs_code', 'memory.drift.typeDescription.review_vs_code'],
  ['recurring_review_finding', 'memory.drift.typeDescription.recurring_review_finding'],
  ['spec_clarification_recurring', 'memory.drift.typeDescription.spec_clarification_recurring'],
];

export interface DriftPanelProps {
  readonly t: (key: string) => string;
  readonly rows: readonly MemoryDriftEventRow[];
  /** Phase 6 S5-C: 日次推移。未取得・0 件なら空配列（チャートは空状態表示へ縮退） */
  readonly historyPoints?: readonly DriftHistoryPoint[];
  readonly isDark?: boolean;
  readonly onResolve: (id: string, note: string) => Promise<void>;
  readonly onLoadDetail: (id: string) => Promise<unknown>;
}

function styledChip(label: string, colorVar: string): HTMLElement {
  const { el } = createChip({ label, size: 'small' });
  el.style.fontSize = '0.65rem';
  el.style.height = '18px';
  if (colorVar) {
    el.style.outline = `1px solid ${colorVar}`;
    el.style.color = colorVar;
  }
  return el;
}

export function mountDriftPanel(
  container: HTMLElement,
  initial: DriftPanelProps,
): VanillaViewHandle<DriftPanelProps> {
  let props = initial;

  // Filter state (presentational, owned here like useState in React component)
  let unresolvedOnly = true;
  let severityFilter = '';
  let typeFilter = '';
  let fixTargetFilter = '';
  let detailId: string | null = null;
  let dialogHandle: VanillaViewHandle<DriftDetailDialogProps> | null = null;

  // Root layout
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'padding:8px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;' +
    'border-bottom:1px solid var(--am-color-divider);';

  // Unresolved-only switch + label
  const switchHandle = createSwitch({
    checked: unresolvedOnly,
    ariaLabel: props.t('memory.drift.unresolvedOnly'),
    onChange: (checked) => {
      unresolvedOnly = checked;
      renderBody();
    },
  });
  const switchLabel = document.createElement('label');
  switchLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;';
  const switchLabelText = document.createElement('span');
  switchLabelText.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
  switchLabelText.textContent = props.t('memory.drift.unresolvedOnly');
  switchLabel.append(switchHandle.el, switchLabelText);

  // Severity select
  function buildSeverityOptions(): SelectOption<string>[] {
    return [
      { value: '', label: 'All' },
      { value: 'info', label: props.t('memory.drift.severity.info') },
      { value: 'warn', label: props.t('memory.drift.severity.warn') },
      { value: 'error', label: props.t('memory.drift.severity.error') },
    ];
  }
  const severitySelect = createSelect<string>({
    value: severityFilter,
    options: buildSeverityOptions(),
    ariaLabel: props.t('memory.drift.filterSeverity'),
    fullWidth: false,
    onChange: (v) => {
      severityFilter = v;
      renderBody();
    },
  });
  severitySelect.el.style.minWidth = '120px';
  severitySelect.el.style.fontSize = '0.75rem';

  // Type select (options built dynamically from rows)
  function buildTypeOptions(): SelectOption<string>[] {
    const driftTypes = [...new Set(props.rows.map((r) => r.driftType))].sort();
    return [
      { value: '', label: 'All' },
      ...driftTypes.map((dt) => ({ value: dt, label: dt })),
    ];
  }
  const typeSelect = createSelect<string>({
    value: typeFilter,
    options: buildTypeOptions(),
    ariaLabel: props.t('memory.drift.filterType'),
    fullWidth: false,
    onChange: (v) => {
      typeFilter = v;
      renderBody();
    },
  });
  typeSelect.el.style.minWidth = '160px';
  typeSelect.el.style.fontSize = '0.75rem';

  // Fix target select
  function buildFixTargetOptions(): SelectOption<string>[] {
    return [
      { value: '', label: 'All' },
      { value: 'code', label: props.t('memory.drift.fixTarget.code') },
      { value: 'spec', label: props.t('memory.drift.fixTarget.spec') },
      { value: 'conv', label: props.t('memory.drift.fixTarget.conv') },
    ];
  }
  const fixTargetSelect = createSelect<string>({
    value: fixTargetFilter,
    options: buildFixTargetOptions(),
    ariaLabel: props.t('memory.drift.fixTarget'),
    fullWidth: false,
    onChange: (v) => {
      fixTargetFilter = v;
      renderBody();
    },
  });
  fixTargetSelect.el.style.minWidth = '120px';
  fixTargetSelect.el.style.fontSize = '0.75rem';

  toolbar.append(switchLabel, severitySelect.el, typeSelect.el, fixTargetSelect.el);

  // --- Body (empty or table) ---
  const bodyHost = document.createElement('div');
  bodyHost.style.cssText = 'flex:1;overflow:auto;';

  // --- Table ---
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  function buildTypeHelpTooltip(): string {
    return DRIFT_TYPE_HELP_ROWS.map(([code, key]) => `${code}: ${props.t(key)}`).join('\n');
  }

  function makeHeaderCell(content: string | HTMLElement, extra?: string): HTMLTableCellElement {
    const th = document.createElement('th');
    th.style.cssText =
      'font-size:0.7rem;color:var(--am-color-text-secondary);' +
      'background:var(--am-color-bg-paper);padding:4px 8px;text-align:left;' +
      'position:sticky;top:0;z-index:1;' + (extra ?? '');
    if (typeof content === 'string') {
      th.textContent = content;
    } else {
      th.appendChild(content);
    }
    return th;
  }

  // "Type" header with help icon tooltip
  const typeHeaderInner = document.createElement('span');
  typeHeaderInner.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
  const typeLabel = document.createElement('span');
  typeLabel.textContent = 'Type';
  const helpIcon = HelpOutline({ color: 'disabled', style: { cursor: 'help', flexShrink: '0', fontSize: '12px' } });
  helpIcon.el.setAttribute('aria-label', 'type-help');
  // SVGSVGElement は createTooltip の reference に使えないため span でラップする
  const helpIconWrap = document.createElement('span');
  helpIconWrap.style.cssText = 'display:inline-flex;align-items:center;cursor:help;';
  helpIconWrap.appendChild(helpIcon.el);
  typeHeaderInner.append(typeLabel, helpIconWrap);
  const helpTooltip = createTooltip({
    reference: helpIconWrap,
    title: buildTypeHelpTooltip(),
    placement: 'top',
  });

  headerRow.append(
    makeHeaderCell('Subject'),
    makeHeaderCell(typeHeaderInner),
    makeHeaderCell(props.t('memory.drift.fixTarget')),
    makeHeaderCell(props.t('memory.drift.filterSeverity')),
    makeHeaderCell('Detected'),
    makeHeaderCell(''),
  );
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  // Empty placeholder
  const emptyEl = document.createElement('div');
  emptyEl.style.cssText =
    'padding:24px;display:flex;align-items:center;justify-content:center;';
  const emptyText = document.createElement('span');
  emptyText.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.appendChild(emptyText);

  // Keep track of per-row tooltips and buttons so we can destroy them
  const rowHandles: { destroy: () => void }[] = [];

  function renderBody(): void {
    // Destroy previous row handles
    for (const h of rowHandles) h.destroy();
    rowHandles.length = 0;

    const filtered = filterDriftRows(props.rows, {
      unresolvedOnly,
      severityFilter,
      typeFilter,
      fixTargetFilter,
    });

    if (props.rows.length === 0) {
      emptyText.textContent = props.t('memory.drift.empty');
      bodyHost.replaceChildren(emptyEl);
      return;
    }

    tbody.replaceChildren();

    for (const row of filtered) {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid var(--am-color-divider);';
      tr.addEventListener('mouseenter', () => {
        tr.style.background = 'var(--am-color-action-hover)';
      });
      tr.addEventListener('mouseleave', () => {
        tr.style.background = '';
      });

      // Subject cell
      const subjectCell = document.createElement('td');
      subjectCell.style.cssText =
        'font-size:0.75rem;color:var(--am-color-text-primary);' +
        'max-width:200px;padding:4px 8px;overflow:hidden;';
      const subjectText = document.createElement('span');
      subjectText.style.cssText = 'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      subjectText.textContent = row.subjectDisplayName || row.subjectEntityId;
      subjectCell.appendChild(subjectText);
      const subjectTip = createTooltip({
        reference: subjectCell,
        title: row.subjectEntityId,
        placement: 'top',
      });
      rowHandles.push(subjectTip);

      // Type cell
      const typeCell = document.createElement('td');
      typeCell.style.cssText = 'font-size:0.7rem;color:var(--am-color-text-secondary);padding:4px 8px;';
      typeCell.textContent = row.driftType;

      // Fix target cell
      const fixTargetCell = document.createElement('td');
      fixTargetCell.style.cssText = 'padding:4px 8px;';
      const target = computeFixTarget(row.driftType);
      const targetChip = styledChip(
        props.t(FIX_TARGET_I18N_KEYS[target]),
        FIX_TARGET_COLOR_VAR[target],
      );
      // Make it outlined style
      targetChip.style.background = 'transparent';
      fixTargetCell.appendChild(targetChip);

      // Severity cell
      const severityCell = document.createElement('td');
      severityCell.style.cssText = 'padding:4px 8px;';
      const sevChip = styledChip(
        row.severity,
        SEVERITY_COLOR_VAR[row.severity] ?? 'var(--am-color-text-secondary)',
      );
      severityCell.appendChild(sevChip);

      // Detected cell
      const detectedCell = document.createElement('td');
      detectedCell.style.cssText =
        'font-size:0.7rem;color:var(--am-color-text-secondary);padding:4px 8px;white-space:nowrap;';
      detectedCell.textContent = row.detectedAt.slice(0, 10);

      // Action cell
      const actionCell = document.createElement('td');
      actionCell.style.cssText = 'padding:4px 8px;text-align:right;white-space:nowrap;';

      if (row.resolvedAt) {
        const resolvedChip = createChip({ label: props.t('memory.drift.resolved'), size: 'small' });
        resolvedChip.el.style.cssText += ';font-size:0.65rem;height:18px;';
        actionCell.appendChild(resolvedChip.el);
        rowHandles.push(resolvedChip);
      } else {
        const { el: detailBtn } = createButton({
          size: 'small',
          label: props.t('memory.drift.detail'),
          onClick: () => openDetail(row.id),
        });
        detailBtn.style.cssText += ';font-size:0.65rem;padding:0;min-width:0;color:var(--am-color-primary-main);';
        actionCell.appendChild(detailBtn);
      }

      tr.append(subjectCell, typeCell, fixTargetCell, severityCell, detectedCell, actionCell);
      tbody.appendChild(tr);
    }

    bodyHost.replaceChildren(table);
  }

  function openDetail(id: string): void {
    if (dialogHandle) {
      dialogHandle.destroy();
      dialogHandle = null;
    }
    detailId = id;
    dialogHandle = mountDriftDetailDialog(document.body, {
      t: props.t,
      eventId: id,
      onClose: () => {
        dialogHandle?.destroy();
        dialogHandle = null;
        detailId = null;
      },
      onResolve: props.onResolve,
      onLoadDetail: props.onLoadDetail,
    });
  }

  // Phase 6 S5-C: 推移グラフはツールバーと一覧の間（全体 → 詳細の順）
  const historyHost = document.createElement('div');
  historyHost.style.cssText = 'flex:0 0 auto;border-bottom:1px solid var(--am-color-divider);';
  const historyChart = mountDriftHistoryChart(historyHost, {
    t: props.t,
    points: props.historyPoints ?? [],
    isDark: props.isDark,
  });

  root.append(toolbar, historyHost, bodyHost);
  container.appendChild(root);

  renderBody();

  return {
    update(next) {
      props = next;
      // Update filter selects with fresh options (rows may have changed)
      severitySelect.update({ options: buildSeverityOptions(), ariaLabel: props.t('memory.drift.filterSeverity') });
      typeSelect.update({ options: buildTypeOptions(), ariaLabel: props.t('memory.drift.filterType') });
      fixTargetSelect.update({ options: buildFixTargetOptions(), ariaLabel: props.t('memory.drift.fixTarget') });
      switchLabelText.textContent = props.t('memory.drift.unresolvedOnly');
      switchHandle.update({ ariaLabel: props.t('memory.drift.unresolvedOnly') });
      helpTooltip.update({ title: buildTypeHelpTooltip() });
      historyChart.update({
        t: props.t,
        points: props.historyPoints ?? [],
        isDark: props.isDark,
      });
      renderBody();
      // Propagate t to open dialog if props changed
      if (dialogHandle && detailId) {
        dialogHandle.update({
          t: props.t,
          eventId: detailId,
          onClose: () => {
            dialogHandle?.destroy();
            dialogHandle = null;
            detailId = null;
          },
          onResolve: props.onResolve,
          onLoadDetail: props.onLoadDetail,
        });
      }
    },
    destroy() {
      for (const h of rowHandles) h.destroy();
      rowHandles.length = 0;
      switchHandle.destroy();
      severitySelect.destroy();
      typeSelect.destroy();
      fixTargetSelect.destroy();
      helpTooltip.destroy();
      historyChart.destroy();
      if (dialogHandle) {
        dialogHandle.destroy();
        dialogHandle = null;
      }
      root.remove();
    },
  };
}
