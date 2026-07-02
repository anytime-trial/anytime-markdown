/**
 * ReleasesPanel vanilla view.
 *
 * Renders a repository-filter dropdown + sticky table of releases.
 * Mirrors the React `components/ReleasesPanel.tsx` without any React/MUI dependency.
 */
import { createChip, createSelect, createTooltip, createInputLabel } from '@anytime-markdown/ui-core';
import { formatLocalDate } from '@anytime-markdown/trail-core/formatDate';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import { getReleaseTableColumns } from '../components/releaseColumns';
import { formatReleaseStepDisplay } from '../components/releaseStepDisplay';

const UNKNOWN_REPO_KEY = '__unknown__';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReleasesPanelProps {
  readonly releases: readonly TrailRelease[];
  readonly t: (key: string) => string;
  readonly commitColors: Readonly<{ feat: string; fix: string; refactor: string; test: string; other: string }>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtOneDecimal(n: number): string {
  return n.toFixed(1);
}

function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function buildRepoOptions(releases: readonly TrailRelease[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of releases) {
    const key = r.repoName ?? UNKNOWN_REPO_KEY;
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  return order;
}

function buildBreakdownBar(
  release: TrailRelease,
  commitColors: ReleasesPanelProps['commitColors'],
  tooltipHandle: { destroy(): void }[],
): HTMLElement {
  const total = release.commitCount;
  const wrap = document.createElement('div');

  if (total === 0) {
    const dash = document.createElement('span');
    dash.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
    dash.textContent = '—';
    wrap.appendChild(dash);
    return wrap;
  }

  const segments: Array<{ label: string; count: number; color: string }> = [
    { label: 'feat', count: release.featCount, color: commitColors.feat },
    { label: 'fix', count: release.fixCount, color: commitColors.fix },
    { label: 'refactor', count: release.refactorCount, color: commitColors.refactor },
    { label: 'test', count: release.testCount, color: commitColors.test },
    { label: 'other', count: release.otherCount, color: commitColors.other },
  ];

  const tooltipText = segments
    .filter((s) => s.count > 0)
    .map((s) => `${s.label}: ${s.count}`)
    .join(', ');

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;height:12px;width:80px;border-radius:4px;overflow:hidden;cursor:default;';

  for (const seg of segments) {
    if (seg.count === 0) continue;
    const slice = document.createElement('div');
    slice.style.cssText = `width:${(seg.count / total) * 100}%;background-color:${seg.color};flex-shrink:0;`;
    bar.appendChild(slice);
  }

  wrap.appendChild(bar);
  tooltipHandle.push(createTooltip({ reference: bar, title: tooltipText, placement: 'top' }));
  return wrap;
}

// ---------------------------------------------------------------------------
// td / th helpers
// ---------------------------------------------------------------------------

function th(text: string, align?: 'right'): HTMLTableCellElement {
  const cell = document.createElement('th');
  cell.style.cssText =
    `padding:6px 16px;font-size:0.75rem;font-weight:600;color:var(--am-color-text-secondary);` +
    `background:var(--am-color-bg-paper,var(--am-color-bg-default));white-space:nowrap;` +
    `border-bottom:1px solid var(--am-color-divider);position:sticky;top:0;z-index:1;` +
    (align === 'right' ? 'text-align:right;' : 'text-align:left;');
  cell.textContent = text;
  return cell;
}

function td(extra = '', align?: 'right'): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.style.cssText =
    `padding:4px 16px;font-size:0.8125rem;border-bottom:1px solid var(--am-color-divider);` +
    (align === 'right' ? 'text-align:right;' : '') + extra;
  return cell;
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

export function mountReleasesPanel(
  container: HTMLElement,
  initial: ReleasesPanelProps,
): VanillaViewHandle<ReleasesPanelProps> {
  let props = initial;
  const tooltipHandles: Array<{ destroy(): void }> = [];

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
  container.appendChild(root);

  // Toolbar (repo selector)
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'padding:8px;display:flex;align-items:center;gap:8px;flex-shrink:0;';
  root.appendChild(toolbar);

  // Body (scrollable table)
  const bodyEl = document.createElement('div');
  bodyEl.style.cssText = 'overflow:auto;flex:1;scrollbar-width:thin;scrollbar-color:var(--am-color-action-disabled,rgba(0,0,0,0.26)) transparent;';
  root.appendChild(bodyEl);

  // --- State ---
  let selectedRepo = '';
  let repoOptions: string[] = [];
  let selectHandle: { el: HTMLElement; update(opts: { value: string; options: { value: string; label: string }[] }): void; destroy(): void } | null = null;

  function filteredReleases(): readonly TrailRelease[] {
    if (selectedRepo === '') return props.releases;
    return props.releases.filter((r) => (r.repoName ?? UNKNOWN_REPO_KEY) === selectedRepo);
  }

  function renderToolbar(): void {
    toolbar.replaceChildren();
    if (repoOptions.length === 0) return;

    const selectWrap = document.createElement('div');
    selectWrap.style.cssText = 'min-width:200px;';

    // 可視ラベル（旧 InputLabel "Repository"）。ariaLabel だけだと晴眼ユーザーに用途が見えない。
    const repoLabel = createInputLabel({ shrink: true, children: props.t('releases.repository') });
    selectWrap.appendChild(repoLabel.el);

    if (selectHandle) {
      selectHandle.destroy();
    }

    selectHandle = createSelect<string>({
      value: selectedRepo,
      options: repoOptions.map((key) => ({
        value: key,
        label: key === UNKNOWN_REPO_KEY ? props.t('releases.unknownRepo') : key,
      })),
      ariaLabel: props.t('releases.repository'),
      onChange: (v) => {
        selectedRepo = v;
        renderBody();
      },
    });
    selectWrap.appendChild(selectHandle.el);
    toolbar.appendChild(selectWrap);
  }

  function renderEmpty(): void {
    bodyEl.replaceChildren();
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:24px;color:var(--am-color-text-secondary);font-size:0.875rem;';
    msg.textContent = props.t('releases.noReleases');
    bodyEl.appendChild(msg);
  }

  function renderBody(): void {
    // Destroy old tooltips
    for (const h of tooltipHandles) h.destroy();
    tooltipHandles.length = 0;
    bodyEl.replaceChildren();

    const releases = filteredReleases();
    if (releases.length === 0) {
      renderEmpty();
      return;
    }

    const columns = getReleaseTableColumns();

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;';

    // Thead
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of columns) {
      headRow.appendChild(th(props.t(col.i18nKey), col.align));
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Tbody
    const tbody = document.createElement('tbody');
    for (const release of releases) {
      const stepDisplay = formatReleaseStepDisplay(release);
      const fixRate = release.commitCount > 0 ? release.fixCount / release.commitCount : 0;

      const tr = document.createElement('tr');
      tr.addEventListener('mouseover', () => { tr.style.backgroundColor = 'var(--am-color-action-hover)'; });
      tr.addEventListener('mouseout', () => { tr.style.backgroundColor = ''; });

      // Version + package tags
      const versionCell = td();
      const versionWrap = document.createElement('div');
      versionWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
      const versionSpan = document.createElement('span');
      versionSpan.style.cssText = 'font-weight:600;font-size:0.8125rem;';
      versionSpan.textContent = release.tag;
      versionWrap.appendChild(versionSpan);
      for (const pt of release.packageTags) {
        const { el } = createChip({ label: pt, size: 'small', variant: 'outlined' });
        el.style.height = '18px';
        el.style.fontSize = '0.65rem';
        versionWrap.appendChild(el);
      }
      versionCell.appendChild(versionWrap);

      // Date
      const dateCell = td();
      dateCell.textContent = formatLocalDate(release.releasedAt);

      // Interval
      const intervalCell = td('', 'right');
      intervalCell.textContent = release.durationDays > 0
        ? `${fmtOneDecimal(release.durationDays)}${props.t('releases.days')}`
        : '—';

      // Total LOC
      const locCell = td('', 'right');
      locCell.textContent = fmtNum(release.totalLines);

      // Steps (total + breakdown)
      const stepsCell = td('', 'right');
      const stepsWrap = document.createElement('div');
      stepsWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;line-height:1.05;';
      const stepsTotal = document.createElement('span');
      stepsTotal.style.cssText = 'font-size:0.8125rem;line-height:1.1;';
      stepsTotal.textContent = stepDisplay.total;
      const stepsBreak = document.createElement('span');
      stepsBreak.style.cssText = 'color:var(--am-color-text-secondary);font-size:0.62rem;line-height:1;white-space:nowrap;';
      stepsBreak.textContent = stepDisplay.breakdown;
      stepsWrap.append(stepsTotal, stepsBreak);
      stepsCell.appendChild(stepsWrap);

      // Files changed
      const filesCell = td('', 'right');
      filesCell.textContent = fmtNum(release.filesChanged);

      // Commits
      const commitsCell = td('', 'right');
      commitsCell.textContent = fmtNum(release.commitCount);

      // Breakdown bar
      const barCell = td();
      barCell.appendChild(buildBreakdownBar(release, props.commitColors, tooltipHandles));

      // Fix rate
      const fixRateCell = td('', 'right');
      fixRateCell.textContent = release.commitCount > 0 ? fmtPercent(fixRate) : '—';

      tr.append(versionCell, dateCell, intervalCell, locCell, stepsCell, filesCell, commitsCell, barCell, fixRateCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    bodyEl.appendChild(table);
  }

  function render(): void {
    const newOptions = buildRepoOptions(props.releases);

    // Update repo selection if options changed
    const optionsChanged = newOptions.join(',') !== repoOptions.join(',');
    repoOptions = newOptions;

    if (optionsChanged) {
      if (repoOptions.length === 0) {
        selectedRepo = '';
      } else if (!repoOptions.includes(selectedRepo)) {
        selectedRepo = repoOptions[0] ?? '';
      }
    }

    if (props.releases.length === 0) {
      toolbar.replaceChildren();
      if (selectHandle) { selectHandle.destroy(); selectHandle = null; }
      renderEmpty();
      return;
    }

    renderToolbar();
    renderBody();
  }

  render();

  return {
    update(next: ReleasesPanelProps) {
      props = next;
      render();
    },
    destroy() {
      for (const h of tooltipHandles) h.destroy();
      tooltipHandles.length = 0;
      selectHandle?.destroy();
      selectHandle = null;
      root.remove();
    },
  };
}
