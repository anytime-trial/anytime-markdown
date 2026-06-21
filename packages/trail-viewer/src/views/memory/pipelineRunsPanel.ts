/**
 * PipelineRunsPanel の vanilla DOM 版。
 * pipeline 実行統計の4セクション（timeline / top entities / invalidations / failed items）を表示する。
 */
import { createChip } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type {
  MemoryFailedItemRow,
  MemoryInvalidationRow,
  MemoryPipelineRunStatsByDayRow,
  MemoryTopEntityRow,
} from '../../data/types';
import { mountPipelineRunsTimeline } from './pipelineRunsTimeline';
import { mountTopEntitiesTable } from './topEntitiesTable';

export interface PipelineRunsPanelProps {
  readonly t: (key: string) => string;
  readonly reader: MemoryReader | null;
  readonly isDark?: boolean;
}

const CHARCOAL = 'var(--am-color-bg-default)';
const HEAD_CSS = `color:var(--am-color-text-secondary);font-size:0.7rem;padding:2px 8px;background-color:${CHARCOAL};text-align:left;font-weight:600;`;
const CELL_CSS = 'padding:2px 8px;';

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

function buildInvalidationsTable(
  invalidations: readonly MemoryInvalidationRow[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:280px;overflow:auto;margin-top:4px;';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.7rem;';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Date', 'Reason', 'Superseded by']) {
    const th = document.createElement('th');
    th.style.cssText = HEAD_CSS;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const inv of invalidations) {
    const tr = document.createElement('tr');
    tr.addEventListener('mouseenter', () => {
      tr.style.backgroundColor = 'var(--am-color-action-hover)';
    });
    tr.addEventListener('mouseleave', () => {
      tr.style.backgroundColor = '';
    });

    const tdDate = document.createElement('td');
    tdDate.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-secondary);white-space:nowrap;`;
    tdDate.textContent = inv.invalidatedAt.slice(0, 10);

    const tdReason = document.createElement('td');
    tdReason.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-primary);`;
    tdReason.textContent = inv.reason;

    const tdSup = document.createElement('td');
    tdSup.style.cssText = `${CELL_CSS}font-size:0.7rem;color:var(--am-color-text-secondary);font-family:monospace;`;
    tdSup.textContent = inv.supersedingEdgeId?.slice(0, 8) ?? '—';

    tr.append(tdDate, tdReason, tdSup);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildFailedItemsTable(
  failedItems: readonly MemoryFailedItemRow[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:280px;overflow:auto;margin-top:4px;';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.7rem;';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Scope', 'Key', 'Attempts', 'Reason']) {
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

    tr.append(tdScope, tdKey, tdAttempts, tdReason);
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
  let runStats: readonly MemoryPipelineRunStatsByDayRow[] = [];
  let entities: readonly MemoryTopEntityRow[] = [];
  let invalidations: readonly MemoryInvalidationRow[] = [];
  let failedItems: readonly MemoryFailedItemRow[] = [];

  const root = document.createElement('div');
  root.setAttribute('aria-label', 'pipeline-runs');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:auto;';
  container.appendChild(root);

  // Sections are mounted lazily in render()
  let timelineHandle: VanillaViewHandle<Parameters<typeof mountPipelineRunsTimeline>[1]> | null = null;
  let topEntitiesHandle: VanillaViewHandle<Parameters<typeof mountTopEntitiesTable>[1]> | null = null;

  // section DOM refs
  let sec1Body: HTMLElement | null = null;
  let sec2Body: HTMLElement | null = null;
  let sec3Body: HTMLElement | null = null;
  let sec4Body: HTMLElement | null = null;
  let emptyEl: HTMLElement | null = null;

  function renderEmpty(): void {
    root.replaceChildren();
    timelineHandle?.destroy();
    timelineHandle = null;
    topEntitiesHandle?.destroy();
    topEntitiesHandle = null;
    sec1Body = sec2Body = sec3Body = sec4Body = null;

    const msg = document.createElement('div');
    msg.style.cssText =
      'padding:24px;display:flex;align-items:center;justify-content:center;font-size:0.875rem;color:var(--am-color-text-secondary);';
    msg.textContent = props.t('memory.runs.empty');
    root.appendChild(msg);
    emptyEl = msg;
  }

  function renderSections(): void {
    if (!props.reader) {
      renderEmpty();
      return;
    }

    // Build layout on first render
    if (!sec1Body) {
      root.replaceChildren();
      emptyEl = null;

      // Section 1: Timeline
      const { wrap: wrap1, body: body1 } = makeSection(props.t('memory.runs.timeline'));
      timelineHandle = mountPipelineRunsTimeline(body1, {
        t: props.t,
        rows: runStats,
        isDark: props.isDark,
      });
      sec1Body = body1;
      root.appendChild(wrap1);

      // Section 2: Top entities
      const { wrap: wrap2, body: body2 } = makeSection(props.t('memory.runs.topEntities'));
      const entityWrap = document.createElement('div');
      entityWrap.style.marginTop = '4px';
      topEntitiesHandle = mountTopEntitiesTable(entityWrap, {
        t: props.t,
        entities,
      });
      body2.appendChild(entityWrap);
      sec2Body = body2;
      root.appendChild(wrap2);

      // Section 3: Invalidations
      const { wrap: wrap3, body: body3 } = makeSection(props.t('memory.runs.invalidations'));
      sec3Body = body3;
      root.appendChild(wrap3);

      // Section 4: Failed items
      const { wrap: wrap4, body: body4 } = makeSection(props.t('memory.runs.failedItems'), false);
      sec4Body = body4;
      root.appendChild(wrap4);
    }

    // Update sub-handles
    timelineHandle?.update({ t: props.t, rows: runStats, isDark: props.isDark });
    topEntitiesHandle?.update({ t: props.t, entities });

    // Section 3: invalidations
    if (sec3Body) {
      sec3Body.replaceChildren();
      if (invalidations.length === 0) {
        const dash = document.createElement('span');
        dash.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);margin-top:4px;';
        dash.textContent = '—';
        sec3Body.appendChild(dash);
      } else {
        sec3Body.appendChild(buildInvalidationsTable(invalidations));
      }
    }

    // Section 4: failed items
    if (sec4Body) {
      sec4Body.replaceChildren();
      if (failedItems.length === 0) {
        const dash = document.createElement('span');
        dash.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);margin-top:4px;';
        dash.textContent = '—';
        sec4Body.appendChild(dash);
      } else {
        sec4Body.appendChild(buildFailedItemsTable(failedItems));
      }
    }
  }

  function loadData(): void {
    if (!props.reader) {
      renderEmpty();
      return;
    }
    const reader = props.reader;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    void reader.listPipelineRunStatsByDay({ since }).then((rows) => {
      runStats = rows;
      renderSections();
    });
    void reader.listTopEntities({ limit: 20 }).then((rows) => {
      entities = rows;
      renderSections();
    });
    void reader.listInvalidations({ limit: 50 }).then((rows) => {
      invalidations = rows;
      renderSections();
    });
    void reader.listFailedItems({ limit: 50 }).then((rows) => {
      failedItems = rows;
      renderSections();
    });
    // Show sections immediately (will have empty data initially)
    renderSections();
  }

  loadData();

  return {
    update(next) {
      const readerChanged = next.reader !== props.reader;
      props = next;
      if (readerChanged) {
        // Reset section refs so we rebuild from scratch
        sec1Body = sec2Body = sec3Body = sec4Body = null;
        timelineHandle?.destroy();
        timelineHandle = null;
        topEntitiesHandle?.destroy();
        topEntitiesHandle = null;
        runStats = [];
        entities = [];
        invalidations = [];
        failedItems = [];
        loadData();
      } else {
        renderSections();
      }
    },
    destroy() {
      timelineHandle?.destroy();
      topEntitiesHandle?.destroy();
      root.remove();
    },
  };
}
