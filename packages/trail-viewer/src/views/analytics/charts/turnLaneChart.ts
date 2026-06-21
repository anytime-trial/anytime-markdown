/**
 * vanilla 版 TurnLaneChart + TurnLaneChartLegend
 * (`components/analytics/charts/TurnLaneChart.tsx` の素 DOM 等価)。
 */
import type { TrailMessage } from '../../../domain/parser/types';
import {
  dominantTool,
  mergeRuns,
  LANE_TOOL_CATS,
  type LaneTool,
} from '../../../domain/analytics/calculators';
import {
  LANE_TOOL_COLORS,
  LANE_TOOL_LABELS,
  laneModelColor,
  laneSkillColor,
} from '../../../components/analytics/constants';
import type { ThemeColors } from '../../../theme/designTokens';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface TurnLaneChartProps {
  assistantMsgs: readonly TrailMessage[];
  tickStep: number;
  commitTurns?: readonly number[];
  errorTurns?: readonly number[];
  mainAgentLabel: string;
  colors: ThemeColors;
}

const LABEL_W = 60;
const PAD_R = 60;
const TOOL_LANE_H = 16;
const SKILL_LINE_H = 8;
const LANE_H = TOOL_LANE_H + SKILL_LINE_H;
const LANE_GAP = 6;
const AXIS_H = 16;
const MODEL_LINE_H = 3;

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

function computeLaneData(assistantMsgs: readonly TrailMessage[]) {
  const mainModelRuns = mergeRuns(assistantMsgs.map((m) => (m.agentId ? '' : (m.model ?? ''))));
  const toolRuns = mergeRuns(
    assistantMsgs.map((m) => (m.agentId ? '' : dominantTool(m.toolCalls))),
  ).filter((r) => r.value !== '');

  const seen = new Map<string, string | undefined>();
  for (const m of assistantMsgs) {
    if (m.agentId && !seen.has(m.agentId)) seen.set(m.agentId, m.agentDescription);
  }
  const subAgents = Array.from(seen.entries()).map(([id, description]) => ({ id, description }));

  const subAgentRuns = subAgents.map(({ id }) => ({
    id,
    runs: mergeRuns(
      assistantMsgs.map((m) => (m.agentId === id ? dominantTool(m.toolCalls) : '')),
    ).filter((r) => r.value !== ''),
  }));

  const subAgentModelRuns = subAgents.map(({ id }) => ({
    id,
    runs: mergeRuns(assistantMsgs.map((m) => (m.agentId === id ? (m.model ?? '') : ''))),
  }));

  let currentMainSkill = '';
  const mainSkillValues = assistantMsgs.map((m) => {
    if (!m.agentId && m.skill) currentMainSkill = m.skill;
    return m.agentId ? '' : currentMainSkill;
  });
  const mainSkillRuns = mergeRuns(mainSkillValues).filter((r) => r.value !== '');

  const subAgentSkillRuns = subAgents.map(({ id }) => {
    let current = '';
    const values = assistantMsgs.map((m) => {
      if (m.agentId === id && m.skill) current = m.skill;
      return m.agentId === id ? current : '';
    });
    return { id, runs: mergeRuns(values).filter((r) => r.value !== '') };
  });

  return {
    mainModelRuns,
    toolRuns,
    subAgents,
    subAgentRuns,
    subAgentModelRuns,
    mainSkillRuns,
    subAgentSkillRuns,
  };
}

function buildSvg(props: TurnLaneChartProps, svgWidth: number): SVGSVGElement {
  const { assistantMsgs, tickStep, commitTurns, errorTurns, mainAgentLabel, colors } = props;
  const N = assistantMsgs.length;

  const plotW = Math.max(svgWidth - LABEL_W - PAD_R, 0);
  const colW = plotW / N;

  const {
    mainModelRuns,
    toolRuns,
    subAgents,
    subAgentRuns,
    subAgentModelRuns,
    mainSkillRuns,
    subAgentSkillRuns,
  } = computeLaneData(assistantMsgs);

  const toolY = 0;
  const subAgentLaneY = (i: number) => toolY + LANE_H + LANE_GAP + i * (LANE_H + LANE_GAP);
  const lastLaneBottom =
    subAgents.length > 0
      ? subAgentLaneY(subAgents.length - 1) + LANE_H
      : toolY + LANE_H;
  const axisY = lastLaneBottom + 4;
  const totalH = axisY + AXIS_H;

  const toX = (i: number) => LABEL_W + i * colW;

  const ticks: number[] = [];
  for (let i = 0; i < N; i++) {
    if ((i + 1) % tickStep === 0) ticks.push(i);
  }

  const svg = svgEl('svg') as SVGSVGElement;
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(totalH));
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  function text(x: number, y: number, content: string, opts?: { anchor?: string; fontSize?: number; fill?: string }): SVGTextElement {
    const el = svgEl('text') as SVGTextElement;
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    if (opts?.anchor) el.setAttribute('text-anchor', opts.anchor);
    el.setAttribute('font-size', String(opts?.fontSize ?? 9));
    el.setAttribute('fill', opts?.fill ?? colors.textSecondary);
    el.textContent = content;
    return el;
  }

  function rect(x: number, y: number, w: number, h: number, fill: string): SVGRectElement {
    const el = svgEl('rect') as SVGRectElement;
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('width', String(Math.max(w, 1)));
    el.setAttribute('height', String(h));
    el.setAttribute('fill', fill);
    return el;
  }

  function line(x1: number, y1: number | string, x2: number, y2: number | string, stroke: string, opts?: { width?: number; dasharray?: string }): SVGLineElement {
    const el = svgEl('line') as SVGLineElement;
    el.setAttribute('x1', String(x1));
    el.setAttribute('y1', String(y1));
    el.setAttribute('x2', String(x2));
    el.setAttribute('y2', String(y2));
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', String(opts?.width ?? 0.5));
    if (opts?.dasharray) el.setAttribute('stroke-dasharray', opts.dasharray);
    return el;
  }

  // Main agent label
  svg.appendChild(
    text(LABEL_W - 4, toolY + TOOL_LANE_H / 2 + 4, mainAgentLabel, { anchor: 'end' }),
  );

  // Tool runs (main)
  for (const run of toolRuns) {
    svg.appendChild(
      rect(
        toX(run.start),
        toolY,
        (run.end - run.start + 1) * colW,
        TOOL_LANE_H,
        LANE_TOOL_COLORS[run.value as LaneTool],
      ),
    );
  }

  // Model runs (main)
  for (const run of mainModelRuns.filter((r) => r.value)) {
    svg.appendChild(
      rect(
        toX(run.start),
        toolY + TOOL_LANE_H - MODEL_LINE_H,
        (run.end - run.start + 1) * colW,
        MODEL_LINE_H,
        laneModelColor(run.value),
      ),
    );
  }

  // Skill runs (main)
  for (const run of mainSkillRuns) {
    const naturalW = (run.end - run.start + 1) * colW;
    const w = Math.max(naturalW, 5);
    const cx = toX(run.start) + naturalW / 2;
    svg.appendChild(
      rect(cx - w / 2, toolY + TOOL_LANE_H, w, SKILL_LINE_H, laneSkillColor(run.value)),
    );
  }

  // Sub-agent lanes
  for (let i = 0; i < subAgents.length; i++) {
    const y = subAgentLaneY(i);
    const toolRunsForAgent = subAgentRuns[i]?.runs ?? [];
    const modelRunsForAgent = subAgentModelRuns[i]?.runs ?? [];
    const skillRunsForAgent = subAgentSkillRuns[i]?.runs ?? [];

    svg.appendChild(text(LABEL_W - 4, y + TOOL_LANE_H / 2 + 4, `SubAgent ${i + 1}`, { anchor: 'end' }));

    for (const run of toolRunsForAgent) {
      svg.appendChild(
        rect(
          toX(run.start),
          y,
          (run.end - run.start + 1) * colW,
          TOOL_LANE_H,
          LANE_TOOL_COLORS[run.value as LaneTool],
        ),
      );
    }
    for (const run of modelRunsForAgent.filter((r) => r.value)) {
      svg.appendChild(
        rect(
          toX(run.start),
          y + TOOL_LANE_H - MODEL_LINE_H,
          (run.end - run.start + 1) * colW,
          MODEL_LINE_H,
          laneModelColor(run.value),
        ),
      );
    }
    for (const run of skillRunsForAgent) {
      const naturalW = (run.end - run.start + 1) * colW;
      const w = Math.max(naturalW, 5);
      const cx = toX(run.start) + naturalW / 2;
      svg.appendChild(rect(cx - w / 2, y + TOOL_LANE_H, w, SKILL_LINE_H, laneSkillColor(run.value)));
    }
  }

  // Commit reference lines
  if (commitTurns) {
    for (const turn of commitTurns) {
      const x = toX(turn - 1) + colW / 2;
      svg.appendChild(line(x, 0, x, axisY, '#4CAF50', { width: 1.5, dasharray: '4 2' }));
    }
  }

  // Error reference lines
  if (errorTurns) {
    for (const turn of errorTurns) {
      const x = toX(turn - 1) + colW / 2;
      svg.appendChild(line(x, 0, x, axisY, '#F44336', { width: 1.5, dasharray: '4 2' }));
    }
  }

  // X-axis
  svg.appendChild(line(LABEL_W, axisY, LABEL_W + plotW, axisY, colors.border));
  for (const i of ticks) {
    const x = toX(i) + colW / 2;
    svg.appendChild(line(x, axisY, x, axisY + 3, colors.border));
    svg.appendChild(text(x, axisY + 13, String(i + 1), { anchor: 'middle' }));
  }

  return svg;
}

export function mountTurnLaneChart(
  container: HTMLElement,
  initial: TurnLaneChartProps,
): VanillaViewHandle<TurnLaneChartProps> {
  let props = initial;

  if (initial.assistantMsgs.length === 0) {
    return {
      update(next) { props = next; },
      destroy() {},
    };
  }

  const wrapper = document.createElement('div');
  wrapper.style.marginTop = '4px';
  container.appendChild(wrapper);

  let currentSvg: SVGSVGElement | null = null;
  let svgWidth = 600;

  function redraw(): void {
    if (currentSvg) {
      currentSvg.remove();
    }
    currentSvg = buildSvg(props, svgWidth);
    wrapper.appendChild(currentSvg);
  }

  redraw();

  const obs = new ResizeObserver((entries) => {
    const w = entries[0].contentRect.width;
    if (w !== svgWidth) {
      svgWidth = w;
      redraw();
    }
  });
  obs.observe(wrapper);

  return {
    update(next) {
      props = next;
      redraw();
    },
    destroy() {
      obs.disconnect();
      wrapper.remove();
    },
  };
}

export interface TurnLaneChartLegendProps {
  assistantMsgs: readonly TrailMessage[];
}

export function mountTurnLaneChartLegend(
  container: HTMLElement,
  initial: TurnLaneChartLegendProps,
): VanillaViewHandle<TurnLaneChartLegendProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding-left:60px;margin-top:4px;';
  container.appendChild(root);

  function buildLegendItem(
    colorBox: { width: number; height: number; borderRadius: string; color: string },
    label: string,
  ): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:4px;';
    const box = document.createElement('div');
    box.style.cssText = `width:${colorBox.width}px;height:${colorBox.height}px;border-radius:${colorBox.borderRadius};background-color:${colorBox.color};flex-shrink:0;`;
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:0.65rem;color:var(--am-color-text-secondary,#aaa);';
    lbl.textContent = label;
    item.appendChild(box);
    item.appendChild(lbl);
    return item;
  }

  function render(): void {
    root.innerHTML = '';

    const uniqueModels: string[] = [];
    const seenModels = new Set<string>();
    for (const m of props.assistantMsgs) {
      const model = m.model ?? '';
      if (!seenModels.has(model)) {
        seenModels.add(model);
        uniqueModels.push(model);
      }
    }

    const uniqueSkills: string[] = [];
    const seenSkills = new Set<string>();
    for (const m of props.assistantMsgs) {
      if (m.skill && !seenSkills.has(m.skill)) {
        seenSkills.add(m.skill);
        uniqueSkills.push(m.skill);
      }
    }

    const usedToolCats = new Set<LaneTool>();
    for (const m of props.assistantMsgs) {
      const d = dominantTool(m.toolCalls);
      if (d !== '') usedToolCats.add(d);
    }

    for (const model of uniqueModels) {
      root.appendChild(
        buildLegendItem(
          { width: 10, height: 10, borderRadius: '2px', color: laneModelColor(model) },
          model || 'unknown',
        ),
      );
    }
    for (const skill of uniqueSkills) {
      root.appendChild(
        buildLegendItem(
          { width: 10, height: 3, borderRadius: '1px', color: laneSkillColor(skill) },
          skill,
        ),
      );
    }
    for (const cat of LANE_TOOL_CATS.filter((c) => usedToolCats.has(c))) {
      root.appendChild(
        buildLegendItem(
          { width: 10, height: 10, borderRadius: '2px', color: LANE_TOOL_COLORS[cat] },
          LANE_TOOL_LABELS[cat],
        ),
      );
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
