/**
 * vanilla 版 SessionCacheTimeline
 * (`components/analytics/charts/SessionCacheTimeline.tsx` の素 DOM 等価)。
 */
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import type { TrailMessage, TrailSession } from '../../../domain/parser/types';
import {
  countCompactDrops,
  dominantTool,
  extractPrefixWithScope,
  parseCommitSubject,
} from '../../../domain/analytics/calculators';
import { getMainAgentLabel } from '../../../components/analytics/helpers';
import type { ThemeColors, ThemeChartColors } from '../../../theme/designTokens';
import { mountAnytimeChartView } from '../anytimeChartView';
import { mountTurnLaneChart, mountTurnLaneChartLegend } from './turnLaneChart';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface SessionCacheTimelineProps {
  messages: readonly TrailMessage[];
  session: TrailSession;
  colors: ThemeColors;
  chartColors: ThemeChartColors;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  isDark: boolean;
  t: (k: string) => string;
}

type Mode = 'tool' | 'skill';

function applyCardStyle(
  el: HTMLElement,
  cardSx: { bgcolor: string; border: string; borderRadius: string },
): void {
  el.style.backgroundColor = cardSx.bgcolor;
  el.style.border = cardSx.border;
  el.style.borderRadius = cardSx.borderRadius;
  el.style.marginTop = '8px';
  el.style.padding = '12px';
}

function buildDataset(
  assistantMsgs: readonly TrailMessage[],
  byUuid: ReadonlyMap<string, TrailMessage>,
) {
  let cumulativeMs = 0;
  let currentSkill = '';
  return assistantMsgs.map((m, i) => {
    const parent = m.parentUuid ? byUuid.get(m.parentUuid) : undefined;
    const apiInferenceMs =
      parent?.timestamp && m.timestamp
        ? Math.max(0, new Date(m.timestamp).getTime() - new Date(parent.timestamp).getTime())
        : 0;
    const toolExecMs = m.toolExecMs ?? 0;
    cumulativeMs += apiInferenceMs + toolExecMs;
    const inputTokens = m.usage?.inputTokens ?? 0;
    const outputTokens = m.usage?.outputTokens ?? 0;
    const hasTool = (m.toolCalls?.length ?? 0) > 0;
    if (!m.agentId && m.skill) currentSkill = m.skill;
    const skillActive = !m.agentId && currentSkill !== '';
    return {
      turn: i + 1,
      inputTokens,
      outputTokens,
      cacheReadTokens: m.usage?.cacheReadTokens ?? 0,
      cacheCreationTokens: m.usage?.cacheCreationTokens ?? 0,
      toolUsageTokens: hasTool ? inputTokens + outputTokens : 0,
      skillUsageTokens: skillActive ? inputTokens + outputTokens : 0,
      skillExecMs: skillActive ? apiInferenceMs + toolExecMs : 0,
      cumulativeMs,
      apiInferenceMs,
      toolExecMs,
    };
  });
}

function buildTokensSpec(
  dataset: ReturnType<typeof buildDataset>,
  mode: Mode,
  chartColors: ThemeChartColors,
  tickStep: number,
  t: (k: string) => string,
): ChartSpec {
  const cats = dataset.map((d) => (d.turn % tickStep === 0 ? String(d.turn) : ''));
  const bar: Series =
    mode === 'tool'
      ? {
          name: t('analytics.chartToolUsageTokens'),
          type: 'bar',
          axis: 'right',
          color: chartColors.toolExec,
          values: dataset.map((d) => d.toolUsageTokens),
        }
      : {
          name: t('analytics.chartSkillUsageTokens'),
          type: 'bar',
          axis: 'right',
          color: chartColors.skill,
          values: dataset.map((d) => d.skillUsageTokens),
        };
  const lines: Series[] = [
    {
      name: t('analytics.chartInput'),
      type: 'line',
      color: chartColors.input,
      values: dataset.map((d) => d.inputTokens),
    },
    {
      name: t('analytics.chartOutput'),
      type: 'line',
      color: chartColors.output,
      values: dataset.map((d) => d.outputTokens),
    },
    {
      name: t('analytics.chartCacheRead'),
      type: 'line',
      color: chartColors.cacheRead,
      values: dataset.map((d) => d.cacheReadTokens),
    },
    {
      name: t('analytics.chartCacheWrite'),
      type: 'line',
      color: chartColors.cacheWrite,
      values: dataset.map((d) => d.cacheCreationTokens),
    },
  ];
  return { kind: 'combo', categories: cats, series: [bar, ...lines], options: { legend: 'none' } };
}

function buildTimingSpec(
  dataset: ReturnType<typeof buildDataset>,
  mode: Mode,
  chartColors: ThemeChartColors,
  tickStep: number,
  t: (k: string) => string,
): ChartSpec {
  const cats = dataset.map((d) => (d.turn % tickStep === 0 ? String(d.turn) : ''));
  const cumLine: Series = {
    name: t('analytics.chartCumulativeInferenceTime'),
    type: 'line',
    axis: 'right',
    color: chartColors.cumulativeTime,
    values: dataset.map((d) => d.cumulativeMs),
  };
  const series: Series[] =
    mode === 'tool'
      ? [
          {
            name: t('analytics.chartApiInferenceTime'),
            type: 'bar',
            color: chartColors.apiInference,
            values: dataset.map((d) => d.apiInferenceMs),
          },
          {
            name: t('analytics.chartToolExecTime'),
            type: 'bar',
            color: chartColors.toolExec,
            values: dataset.map((d) => d.toolExecMs),
          },
          cumLine,
        ]
      : [
          {
            name: t('analytics.chartSkillExecTime'),
            type: 'bar',
            color: chartColors.skill,
            values: dataset.map((d) => d.skillExecMs),
          },
          cumLine,
        ];
  return {
    kind: 'combo',
    categories: cats,
    series,
    options: { stacked: mode === 'tool', legend: 'none' },
  };
}

/** StackedReferenceLines 相当 — チャート群に重ねる overlay SVG */
function mountStackedReferenceLines(
  container: HTMLElement,
  commitTurns: readonly number[],
  errorTurns: readonly number[],
  totalTurns: number,
): { update(commit: readonly number[], error: readonly number[], total: number): void; destroy(): void } {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:absolute;top:16px;left:0;width:100%;height:calc(100% - 32px);pointer-events:none;';
  container.appendChild(overlay);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let svgEl: SVGSVGElement | null = null;
  let overlayWidth = 0;
  let lastCommit = commitTurns;
  let lastError = errorTurns;
  let lastTotal = totalTurns;

  const LABEL_W = 60;
  const PAD_R = 60;

  function redraw(): void {
    if (svgEl) svgEl.remove();
    if (overlayWidth <= 0 || lastTotal <= 0) return;
    const plotW = Math.max(overlayWidth - LABEL_W - PAD_R, 0);
    const colW = plotW / lastTotal;
    const turnX = (turn: number) => LABEL_W + (turn - 0.5) * colW;

    svgEl = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.style.display = 'block';

    for (const turn of lastCommit) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(turnX(turn)));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(turnX(turn)));
      line.setAttribute('y2', '100%');
      line.setAttribute('stroke', '#4CAF50');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4 2');
      svgEl.appendChild(line);
    }
    for (const turn of lastError) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(turnX(turn)));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(turnX(turn)));
      line.setAttribute('y2', '100%');
      line.setAttribute('stroke', '#F44336');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4 2');
      svgEl.appendChild(line);
    }
    overlay.appendChild(svgEl);
  }

  const obs = new ResizeObserver((entries) => {
    overlayWidth = entries[0].contentRect.width;
    redraw();
  });
  obs.observe(overlay);

  return {
    update(commit, error, total) {
      lastCommit = commit;
      lastError = error;
      lastTotal = total;
      redraw();
    },
    destroy() {
      obs.disconnect();
      overlay.remove();
    },
  };
}

function computeTickStep(totalTurns: number): number {
  if (totalTurns <= 5) return 1;
  if (totalTurns <= 10) return 2;
  if (totalTurns <= 25) return 5;
  if (totalTurns <= 50) return 10;
  if (totalTurns <= 100) return 20;
  if (totalTurns <= 250) return 50;
  if (totalTurns <= 500) return 100;
  if (totalTurns <= 1000) return 200;
  return 500;
}

export function mountSessionCacheTimeline(
  container: HTMLElement,
  initial: SessionCacheTimelineProps,
): VanillaViewHandle<SessionCacheTimelineProps> {
  let props = initial;
  let mode: Mode = 'tool';

  const card = document.createElement('div');
  applyCardStyle(card, props.cardSx);
  container.appendChild(card);

  // ─── Header row (title + compact chip + toggle) ───
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  card.appendChild(header);

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:0.8125rem;font-weight:600;';
  header.appendChild(titleEl);

  let chipEl: HTMLElement | null = null;

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  header.appendChild(spacer);

  // Toggle buttons
  const toggleGroup = document.createElement('div');
  toggleGroup.style.cssText = 'display:flex;gap:0;border:1px solid var(--am-color-border,#444);border-radius:4px;overflow:hidden;';
  header.appendChild(toggleGroup);

  function createToggleBtn(label: string, value: Mode): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset['mode'] = value;
    btn.textContent = label;
    btn.style.cssText =
      'padding:2px 8px;font-size:0.75rem;border:none;cursor:pointer;background:transparent;color:inherit;transition:background 0.15s;';
    return btn;
  }

  let toolBtn: HTMLButtonElement;
  let skillBtn: HTMLButtonElement;

  function updateToggleActive(): void {
    const activeStyle = 'background:var(--am-color-primary,#4dd0e1);color:#000;';
    const inactiveStyle = 'background:transparent;color:inherit;';
    toolBtn.style.cssText =
      `padding:2px 8px;font-size:0.75rem;border:none;cursor:pointer;${mode === 'tool' ? activeStyle : inactiveStyle}`;
    skillBtn.style.cssText =
      `padding:2px 8px;font-size:0.75rem;border:none;cursor:pointer;${mode === 'skill' ? activeStyle : inactiveStyle}`;
  }

  toolBtn = createToggleBtn('', 'tool');
  skillBtn = createToggleBtn('', 'skill');

  toolBtn.addEventListener('click', () => {
    if (mode !== 'tool') {
      mode = 'tool';
      updateToggleActive();
      rerenderContent();
    }
  });
  skillBtn.addEventListener('click', () => {
    if (mode !== 'skill') {
      mode = 'skill';
      updateToggleActive();
      rerenderContent();
    }
  });
  toggleGroup.appendChild(toolBtn);
  toggleGroup.appendChild(skillBtn);

  // ─── Content area ───
  const contentArea = document.createElement('div');
  card.appendChild(contentArea);

  // Handles for charts
  let tokensHandle: VanillaViewHandle<{ spec: ChartSpec; height: number; isDark: boolean }> | null = null;
  let timingHandle: VanillaViewHandle<{ spec: ChartSpec; height: number; isDark: boolean }> | null = null;
  let laneHandle: VanillaViewHandle<import('./turnLaneChart').TurnLaneChartProps> | null = null;
  let legendHandle: VanillaViewHandle<import('./turnLaneChart').TurnLaneChartLegendProps> | null = null;
  let refLinesHandle: ReturnType<typeof mountStackedReferenceLines> | null = null;
  let chartsWrapper: HTMLElement | null = null;

  function destroyContent(): void {
    tokensHandle?.destroy();
    timingHandle?.destroy();
    laneHandle?.destroy();
    legendHandle?.destroy();
    refLinesHandle?.destroy();
    tokensHandle = null;
    timingHandle = null;
    laneHandle = null;
    legendHandle = null;
    refLinesHandle = null;
    chartsWrapper?.remove();
    chartsWrapper = null;
    contentArea.innerHTML = '';
  }

  function renderHeader(): void {
    const assistantMsgs = props.messages.filter((m) => m.type === 'assistant' && m.usage);
    const hasData = assistantMsgs.length > 0;
    const compactDrops = countCompactDrops(assistantMsgs);

    titleEl.textContent = `${props.t('analytics.sessionCacheTimelineTitle')}${hasData ? ` (${assistantMsgs.length} ${props.t('analytics.turns')})` : ''}`;

    toolBtn.textContent = props.t('analytics.modeTool');
    toolBtn.title = props.t('analytics.modeTool.description');
    skillBtn.textContent = props.t('analytics.modeSkill');
    skillBtn.title = props.t('analytics.modeSkill.description');
    updateToggleActive();

    // Compact chip
    if (chipEl) {
      chipEl.remove();
      chipEl = null;
    }
    if (compactDrops >= 2) {
      chipEl = document.createElement('span');
      chipEl.title = props.t('analytics.compactLoopTooltip');
      chipEl.textContent = `⚠ Compact \xD7${compactDrops}`;
      chipEl.style.cssText =
        'border:1px solid var(--am-color-warning,#ff9800);border-radius:4px;font-size:0.7rem;padding:0 4px;height:20px;line-height:20px;flex-shrink:0;cursor:default;';
      // Insert before spacer
      header.insertBefore(chipEl, spacer);
    }
  }

  function rerenderContent(): void {
    destroyContent();

    const assistantMsgs = props.messages.filter((m) => m.type === 'assistant' && m.usage);
    const hasData = assistantMsgs.length > 0;

    if (!hasData) {
      const emptyBox = document.createElement('div');
      emptyBox.style.cssText = `height:200px;display:flex;align-items:center;justify-content:center;border:1px dashed ${props.colors.border};border-radius:4px;`;
      const emptyText = document.createElement('span');
      emptyText.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
      emptyText.textContent = props.t('analytics.noTokenData');
      emptyBox.appendChild(emptyText);
      contentArea.appendChild(emptyBox);
      return;
    }

    // Compute data
    const byUuid = new Map<string, TrailMessage>();
    for (const m of props.messages) byUuid.set(m.uuid, m);

    const dataset = buildDataset(assistantMsgs, byUuid);
    const totalTurns = dataset.length;
    const tickStep = computeTickStep(totalTurns);

    const mainAgentLabel = getMainAgentLabel(props.session.source);

    // Agent index map
    const agentIndexMap = new Map<string, number>();
    let idx = 0;
    for (const m of assistantMsgs) {
      if (m.agentId && !agentIndexMap.has(m.agentId)) agentIndexMap.set(m.agentId, ++idx);
    }

    const commitTurns: number[] = assistantMsgs.flatMap((m, i) => {
      if (!((m.triggerCommitHashes && m.triggerCommitHashes.length > 0) || m.hasCommit)) return [];
      const bashCmd = m.toolCalls?.find((tc) => tc.name === 'Bash')?.input?.command;
      const subject = typeof bashCmd === 'string' ? parseCommitSubject(bashCmd) : '';
      void extractPrefixWithScope(subject); // side-effect-free, used for completeness
      return [i + 1];
    });

    const errorTurns: number[] = assistantMsgs.flatMap((m, i) => {
      if (!m.hasToolError) return [];
      return [i + 1];
    });

    // Build wrapper with position:relative for overlay
    chartsWrapper = document.createElement('div');
    chartsWrapper.style.position = 'relative';
    contentArea.appendChild(chartsWrapper);

    // Tokens chart
    const tokensContainer = document.createElement('div');
    chartsWrapper.appendChild(tokensContainer);
    tokensHandle = mountAnytimeChartView(tokensContainer, {
      spec: buildTokensSpec(dataset, mode, props.chartColors, tickStep, props.t),
      height: 200,
      isDark: props.isDark,
    }) as VanillaViewHandle<{ spec: ChartSpec; height: number; isDark: boolean }>;

    // Timing chart
    const timingContainer = document.createElement('div');
    chartsWrapper.appendChild(timingContainer);
    timingHandle = mountAnytimeChartView(timingContainer, {
      spec: buildTimingSpec(dataset, mode, props.chartColors, tickStep, props.t),
      height: 140,
      isDark: props.isDark,
    }) as VanillaViewHandle<{ spec: ChartSpec; height: number; isDark: boolean }>;

    // TurnLaneChart
    laneHandle = mountTurnLaneChart(chartsWrapper, {
      assistantMsgs,
      tickStep,
      commitTurns,
      errorTurns,
      mainAgentLabel,
      colors: props.colors,
    });

    // StackedReferenceLines overlay
    refLinesHandle = mountStackedReferenceLines(chartsWrapper, commitTurns, errorTurns, totalTurns);

    // Legend
    legendHandle = mountTurnLaneChartLegend(contentArea, { assistantMsgs });
  }

  // Initial render
  renderHeader();
  rerenderContent();

  return {
    update(next) {
      props = next;
      applyCardStyle(card, next.cardSx);
      renderHeader();
      rerenderContent();
    },
    destroy() {
      destroyContent();
      card.remove();
    },
  };
}
