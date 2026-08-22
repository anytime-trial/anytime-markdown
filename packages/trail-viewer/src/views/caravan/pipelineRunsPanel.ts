/**
 * PipelineRunsPanel の vanilla DOM 版。
 * pipeline 実行統計の3セクション（timeline / run list / failed items）を表示する。
 */
import { createChip } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { CaravanReader } from '../../data/readers/CaravanReader';
import type {
  CaravanFailedItemRow,
  CaravanPipelineRunLogRow,
  CaravanPipelineRunRow,
  CaravanPipelineRunStatsByDayRow,
} from '../../data/types';
import { mountPipelineRunsTimeline } from './pipelineRunsTimeline';

export interface PipelineRunsPanelProps {
  readonly t: (key: string) => string;
  readonly reader: CaravanReader | null;
  readonly isDark?: boolean;
}

const CHARCOAL = 'var(--am-color-bg-default)';
const HEAD_CSS = `color:var(--am-color-text-secondary);font-size:0.7rem;padding:2px 8px;background-color:${CHARCOAL};text-align:left;font-weight:600;`;
const CELL_CSS = 'padding:2px 8px;';
const WAVES = ['sources', 'primary', 'memory', 'derived', 'system'] as const;
type WaveFilter = 'all' | typeof WAVES[number];

function makeSection(label: string, borderBottom = true): { wrap: HTMLElement; body: HTMLElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    `padding:12px 16px 8px;${borderBottom ? 'border-bottom:1px solid var(--am-color-divider);' : ''}`;
  const heading = document.createElement('span');
  heading.style.cssText =
    'display:block;margin-bottom:6px;font-size:0.625rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--am-color-text-secondary);font-weight:600;';
  heading.textContent = label;
  wrap.appendChild(heading);
  const body = document.createElement('div');
  wrap.appendChild(body);
  return { wrap, body };
}

function formatDateTime(value: string): string {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function statusColor(status: string): string {
  if (status === 'error') return 'var(--am-color-error-main)';
  if (status === 'partial') return 'var(--am-color-warning-main)';
  if (status === 'running') return 'var(--am-color-info-main)';
  if (status === 'success') return 'var(--am-color-success-main)';
  // skipped は失敗ではないが成功でもない（起動していない）。既定の中間色を当てる。
  if (status === 'skipped') return 'var(--am-color-text-secondary)';
  return 'var(--am-color-text-secondary)';
}

function statusLabel(t: (key: string) => string, status: string): string {
  return t(`caravan.runs.status.${status}`);
}

function buildWaveFilter(
  t: (key: string) => string,
  selectedWave: WaveFilter,
  onSelect: (wave: WaveFilter) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 8px 8px;';

  const label = document.createElement('span');
  label.style.cssText =
    'font-size:0.7rem;color:var(--am-color-text-secondary);font-weight:600;';
  label.textContent = t('caravan.runs.filterWave');
  wrap.appendChild(label);

  for (const wave of ['all', ...WAVES] as const) {
    const chipHandle = createChip({
      label: wave === 'all' ? t('caravan.runs.wave.all') : wave,
      size: 'small',
      variant: wave === selectedWave ? 'filled' : 'outlined',
      onClick: () => onSelect(wave),
    });
    chipHandle.el.setAttribute('aria-pressed', String(wave === selectedWave));
    chipHandle.el.style.height = '22px';
    chipHandle.el.style.fontSize = '0.7rem';
    wrap.appendChild(chipHandle.el);
  }
  return wrap;
}

function buildLogsTable(
  logs: readonly CaravanPipelineRunLogRow[],
  t: (key: string) => string,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:180px;overflow:auto;margin-top:6px;';

  if (logs.length === 0) {
    const dash = document.createElement('span');
    dash.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);';
    dash.textContent = '—';
    wrap.appendChild(dash);
    return wrap;
  }

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.68rem;';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of [
    t('caravan.runs.column.timestamp'),
    t('caravan.runs.column.level'),
    t('caravan.runs.column.component'),
    t('caravan.runs.column.message'),
  ]) {
    const th = document.createElement('th');
    th.style.cssText = HEAD_CSS;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const log of logs) {
    const tr = document.createElement('tr');
    const tdTime = document.createElement('td');
    tdTime.style.cssText = `${CELL_CSS}color:var(--am-color-text-secondary);white-space:nowrap;`;
    tdTime.textContent = formatDateTime(log.timestamp);
    const tdLevel = document.createElement('td');
    tdLevel.style.cssText = `${CELL_CSS}color:var(--am-color-text-primary);white-space:nowrap;`;
    tdLevel.textContent = log.level;
    const tdComponent = document.createElement('td');
    tdComponent.style.cssText = `${CELL_CSS}color:var(--am-color-text-secondary);white-space:nowrap;`;
    tdComponent.textContent = log.component;
    const tdMessage = document.createElement('td');
    tdMessage.style.cssText = `${CELL_CSS}color:var(--am-color-text-primary);`;
    tdMessage.textContent = log.message;
    tr.append(tdTime, tdLevel, tdComponent, tdMessage);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildRunExpansion(
  run: CaravanPipelineRunRow,
  logs: readonly CaravanPipelineRunLogRow[] | null,
  t: (key: string) => string,
): { row: HTMLTableRowElement; logsMount: HTMLElement } {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 6;
  td.style.cssText = `${CELL_CSS}background-color:var(--am-color-action-selected);border-top:1px solid var(--am-color-divider);border-bottom:1px solid var(--am-color-divider);`;

  const errorHeading = document.createElement('div');
  errorHeading.style.cssText =
    'font-size:0.7rem;color:var(--am-color-text-secondary);font-weight:600;margin-bottom:4px;';
  errorHeading.textContent = t('caravan.runs.errorDetail');

  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:0 0 8px;padding:8px;white-space:pre-wrap;overflow:auto;max-height:180px;font-size:0.7rem;color:var(--am-color-text-primary);background-color:var(--am-color-bg-paper);border:1px solid var(--am-color-divider);';
  pre.textContent = run.errorDetail || '—';

  const logsHeading = document.createElement('div');
  logsHeading.style.cssText =
    'font-size:0.7rem;color:var(--am-color-text-secondary);font-weight:600;margin:6px 0 4px;';
  logsHeading.textContent = t('caravan.runs.logs');

  const logsMount = document.createElement('div');
  logsMount.setAttribute('data-pipeline-run-logs', run.id);
  if (logs) {
    logsMount.appendChild(buildLogsTable(logs, t));
  } else {
    const loading = document.createElement('span');
    loading.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);';
    loading.textContent = t('viewer.loading');
    logsMount.appendChild(loading);
  }

  td.append(errorHeading, pre, logsHeading, logsMount);
  tr.appendChild(td);
  return { row: tr, logsMount };
}

function buildPipelineRunsTable(
  runs: readonly CaravanPipelineRunRow[],
  t: (key: string) => string,
  loadLogs: (runId: string) => Promise<readonly CaravanPipelineRunLogRow[]>,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:320px;overflow:auto;margin-top:4px;';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.7rem;';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of [
    t('caravan.runs.column.startedAt'),
    t('caravan.runs.column.scope'),
    t('caravan.runs.column.wave'),
    t('caravan.runs.column.status'),
    t('caravan.runs.column.duration'),
    t('caravan.runs.column.itemsProcessed'),
  ]) {
    const th = document.createElement('th');
    th.style.cssText = HEAD_CSS;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const run of runs) {
    const tr = document.createElement('tr');
    const expandable = run.status === 'error' || run.status === 'partial';
    let expandedRow: HTMLTableRowElement | null = null;

    tr.addEventListener('mouseenter', () => {
      tr.style.backgroundColor = 'var(--am-color-action-hover)';
    });
    tr.addEventListener('mouseleave', () => {
      tr.style.backgroundColor = '';
    });
    if (expandable) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        if (expandedRow) {
          expandedRow.remove();
          expandedRow = null;
          return;
        }
        const { row: detailRow, logsMount } = buildRunExpansion(run, null, t);
        tr.after(detailRow);
        expandedRow = detailRow;
        void Promise.resolve(loadLogs(run.id)).then((logs) => {
          if (!detailRow.parentNode) return;
          logsMount.replaceChildren(buildLogsTable(logs, t));
        });
      });
    }

    const tdStart = document.createElement('td');
    tdStart.style.cssText = `${CELL_CSS}color:var(--am-color-text-secondary);white-space:nowrap;`;
    tdStart.textContent = formatDateTime(run.startedAt);

    const tdScope = document.createElement('td');
    tdScope.style.cssText = CELL_CSS;
    const { el: scopeChip } = createChip({ label: run.scope, size: 'small' });
    scopeChip.style.fontSize = '0.65rem';
    scopeChip.style.height = '18px';
    tdScope.appendChild(scopeChip);

    const tdWave = document.createElement('td');
    tdWave.style.cssText = `${CELL_CSS}color:var(--am-color-text-primary);white-space:nowrap;`;
    tdWave.textContent = run.wave;

    const tdStatus = document.createElement('td');
    tdStatus.style.cssText = `${CELL_CSS}color:${statusColor(run.status)};font-weight:600;white-space:nowrap;`;
    tdStatus.textContent = statusLabel(t, run.status);

    const tdDuration = document.createElement('td');
    tdDuration.style.cssText = `${CELL_CSS}color:var(--am-color-text-secondary);white-space:nowrap;`;
    tdDuration.textContent = formatDurationMs(run.durationMs);

    const tdItems = document.createElement('td');
    tdItems.style.cssText = `${CELL_CSS}color:var(--am-color-text-primary);text-align:right;`;
    tdItems.textContent = String(run.itemsProcessed);

    tr.append(tdStart, tdScope, tdWave, tdStatus, tdDuration, tdItems);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildFailedItemsTable(
  failedItems: readonly CaravanFailedItemRow[],
  t: (key: string) => string,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:280px;overflow:auto;margin-top:4px;';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.7rem;';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of [
    t('caravan.runs.column.scope'),
    t('caravan.runs.column.key'),
    t('caravan.runs.column.attempts'),
    t('caravan.runs.column.reason'),
    t('caravan.runs.column.detail'),
  ]) {
    const th = document.createElement('th');
    th.style.cssText = HEAD_CSS;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const item of failedItems) {
    const tr = document.createElement('tr');
    tr.addEventListener('mouseenter', () => {
      tr.style.backgroundColor = 'var(--am-color-action-hover)';
    });
    tr.addEventListener('mouseleave', () => {
      tr.style.backgroundColor = '';
    });

    const tdScope = document.createElement('td');
    tdScope.style.cssText = CELL_CSS;
    const { el: chip } = createChip({ label: item.scope, size: 'small' });
    chip.style.fontSize = '0.65rem';
    chip.style.height = '18px';
    tdScope.appendChild(chip);

    const tdKey = document.createElement('td');
    tdKey.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-secondary);max-width:180px;`;
    const keySpan = document.createElement('span');
    keySpan.style.cssText =
      'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    keySpan.textContent = item.itemKey;
    keySpan.title = item.itemKey;
    tdKey.appendChild(keySpan);

    const tdAttempts = document.createElement('td');
    tdAttempts.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-primary);`;
    tdAttempts.textContent = String(item.attemptCount);

    const tdReason = document.createElement('td');
    tdReason.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-secondary);max-width:200px;`;
    const reasonSpan = document.createElement('span');
    reasonSpan.style.cssText =
      'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    reasonSpan.textContent = item.reason;
    reasonSpan.title = item.reason;
    tdReason.appendChild(reasonSpan);

    const tdDetail = document.createElement('td');
    tdDetail.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-secondary);max-width:240px;`;
    const detailSpan = document.createElement('span');
    detailSpan.style.cssText =
      'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    detailSpan.textContent = item.detail;
    detailSpan.title = item.detail;
    tdDetail.appendChild(detailSpan);

    tr.append(tdScope, tdKey, tdAttempts, tdReason, tdDetail);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function mountPipelineRunsPanel(
  container: HTMLElement,
  initial: PipelineRunsPanelProps,
): VanillaViewHandle<PipelineRunsPanelProps> {
  let props = initial;
  let destroyed = false;
  let loadToken = 0;
  let selectedWave: WaveFilter = 'all';
  let runStats: readonly CaravanPipelineRunStatsByDayRow[] = [];
  let pipelineRuns: readonly CaravanPipelineRunRow[] = [];
  let failedItems: readonly CaravanFailedItemRow[] = [];

  const root = document.createElement('div');
  root.setAttribute('aria-label', 'pipeline-runs');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:auto;';
  container.appendChild(root);

  // Sections are mounted lazily in render()
  let timelineHandle: VanillaViewHandle<Parameters<typeof mountPipelineRunsTimeline>[1]> | null = null;

  // section DOM refs
  let timelineBody: HTMLElement | null = null;
  let timelineMount: HTMLElement | null = null;
  let runsBody: HTMLElement | null = null;
  let failedItemsBody: HTMLElement | null = null;

  function renderEmpty(): void {
    root.replaceChildren();
    timelineHandle?.destroy();
    timelineHandle = null;
    timelineBody = timelineMount = runsBody = failedItemsBody = null;

    const msg = document.createElement('div');
    msg.style.cssText =
      'padding:24px;display:flex;align-items:center;justify-content:center;font-size:0.875rem;color:var(--am-color-text-secondary);';
    msg.textContent = props.t('caravan.runs.empty');
    root.appendChild(msg);
  }

  function renderSections(): void {
    if (!props.reader) {
      renderEmpty();
      return;
    }

    // Build layout on first render
    if (!timelineBody) {
      root.replaceChildren();

      // Section 1: Timeline
      const { wrap: wrap1, body: body1 } = makeSection(props.t('caravan.runs.timeline'));
      timelineMount = document.createElement('div');
      body1.appendChild(timelineMount);
      timelineHandle = mountPipelineRunsTimeline(timelineMount, {
        t: props.t,
        rows: runStats,
        isDark: props.isDark,
      });
      timelineBody = body1;
      root.appendChild(wrap1);

      // Section 2: Run list
      const { wrap: wrapRuns, body: bodyRuns } = makeSection(props.t('caravan.runs.runList'));
      runsBody = bodyRuns;
      root.appendChild(wrapRuns);

      // Section 3: Failed items
      const { wrap: wrapFailed, body: bodyFailed } = makeSection(props.t('caravan.runs.failedItems'), false);
      failedItemsBody = bodyFailed;
      root.appendChild(wrapFailed);
    }

    // Update sub-handles
    if (timelineBody && timelineMount) {
      timelineBody.replaceChildren();
      timelineBody.appendChild(buildWaveFilter(props.t, selectedWave, (wave) => {
        if (selectedWave === wave) return;
        selectedWave = wave;
        loadData();
      }));
      timelineBody.appendChild(timelineMount);
    }
    timelineHandle?.update({ t: props.t, rows: runStats, isDark: props.isDark });

    if (runsBody) {
      runsBody.replaceChildren();
      if (pipelineRuns.length === 0) {
        const dash = document.createElement('span');
        dash.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);margin-top:4px;';
        dash.textContent = '—';
        runsBody.appendChild(dash);
      } else {
        runsBody.appendChild(buildPipelineRunsTable(pipelineRuns, props.t, async (runId) => {
          if (!props.reader) return [];
          return props.reader.listPipelineRunLogs({ runId, limit: 100 });
        }));
      }
    }

    if (failedItemsBody) {
      failedItemsBody.replaceChildren();
      if (failedItems.length === 0) {
        const dash = document.createElement('span');
        dash.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);margin-top:4px;';
        dash.textContent = '—';
        failedItemsBody.appendChild(dash);
      } else {
        failedItemsBody.appendChild(buildFailedItemsTable(failedItems, props.t));
      }
    }
  }

  function loadData(): void {
    if (!props.reader) {
      renderEmpty();
      return;
    }
    const reader = props.reader;
    loadToken += 1;
    const token = loadToken;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    runStats = [];
    pipelineRuns = [];
    renderSections();
    void reader.listPipelineRunStatsByDay({ since }).then((rows) => {
      if (destroyed || token !== loadToken) return;
      runStats = selectedWave === 'all' ? rows : rows.filter((row) => row.wave === selectedWave);
      renderSections();
    });
    void reader.listPipelineRuns({
      since,
      wave: selectedWave === 'all' ? undefined : selectedWave,
      limit: 100,
    }).then((rows) => {
      if (destroyed || token !== loadToken) return;
      pipelineRuns = rows;
      renderSections();
    });
    void reader.listFailedItems({ limit: 50 }).then((rows) => {
      if (destroyed || token !== loadToken) return;
      failedItems = rows;
      renderSections();
    });
  }

  loadData();

  return {
    update(next) {
      const readerChanged = next.reader !== props.reader;
      props = next;
      if (readerChanged) {
        // Reset section refs so we rebuild from scratch
        timelineBody = timelineMount = runsBody = failedItemsBody = null;
        timelineHandle?.destroy();
        timelineHandle = null;
        runStats = [];
        pipelineRuns = [];
        failedItems = [];
        loadData();
      } else {
        renderSections();
      }
    },
    destroy() {
      destroyed = true;
      timelineHandle?.destroy();
      root.remove();
    },
  };
}
