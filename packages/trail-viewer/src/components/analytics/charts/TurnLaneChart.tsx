import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '../../../ui';
import { useTrailTheme } from '../../TrailThemeContext';
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
} from '../constants';

export function TurnLaneChart({
  assistantMsgs,
  tickStep,
  commitTurns,
  errorTurns,
  mainAgentLabel,
}: Readonly<{
  assistantMsgs: readonly TrailMessage[];
  tickStep: number;
  commitTurns?: readonly number[];
  errorTurns?: readonly number[];
  mainAgentLabel: string;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(600);
  const { colors } = useTrailTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setSvgWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const mainModelRuns = useMemo(() =>
    mergeRuns(assistantMsgs.map((m) => m.agentId ? '' : (m.model ?? ''))),
    [assistantMsgs],
  );

  const toolRuns = useMemo(() =>
    mergeRuns(assistantMsgs.map((m) => m.agentId ? '' : dominantTool(m.toolCalls))).filter((r) => r.value !== ''),
    [assistantMsgs],
  );

  const subAgents = useMemo(() => {
    const seen = new Map<string, string | undefined>();
    for (const m of assistantMsgs) {
      if (m.agentId && !seen.has(m.agentId)) seen.set(m.agentId, m.agentDescription);
    }
    return Array.from(seen.entries()).map(([id, description]) => ({ id, description }));
  }, [assistantMsgs]);

  const subAgentRuns = useMemo(() =>
    subAgents.map(({ id }) => ({
      id,
      runs: mergeRuns(assistantMsgs.map((m) =>
        m.agentId === id ? dominantTool(m.toolCalls) : '',
      )).filter((r) => r.value !== ''),
    })),
    [assistantMsgs, subAgents],
  );

  const subAgentModelRuns = useMemo(() =>
    subAgents.map(({ id }) => ({
      id,
      runs: mergeRuns(assistantMsgs.map((m) => m.agentId === id ? (m.model ?? '') : '')),
    })),
    [assistantMsgs, subAgents],
  );

  const mainSkillRuns = useMemo(() => {
    let current = '';
    const values = assistantMsgs.map((m) => {
      if (!m.agentId && m.skill) current = m.skill;
      return m.agentId ? '' : current;
    });
    return mergeRuns(values).filter((r) => r.value !== '');
  }, [assistantMsgs]);

  const subAgentSkillRuns = useMemo(() =>
    subAgents.map(({ id }) => {
      let current = '';
      const values = assistantMsgs.map((m) => {
        if (m.agentId === id && m.skill) current = m.skill;
        return m.agentId === id ? current : '';
      });
      return { id, runs: mergeRuns(values).filter((r) => r.value !== '') };
    }),
    [assistantMsgs, subAgents],
  );

  const N = assistantMsgs.length;
  if (N === 0) return null;

  const LABEL_W = 60;
  const PAD_R = 60;
  const plotW = Math.max(svgWidth - LABEL_W - PAD_R, 0);
  const colW = plotW / N;

  const TOOL_LANE_H = 16;
  const SKILL_LINE_H = 8;
  const LANE_H = TOOL_LANE_H + SKILL_LINE_H;
  const LANE_GAP = 6;
  const AXIS_H = 16;

  const MODEL_LINE_H = 3;
  const toolY = 0;
  const subAgentLaneY = (i: number) => toolY + LANE_H + LANE_GAP + i * (LANE_H + LANE_GAP);
  const lastLaneBottom = subAgents.length > 0
    ? subAgentLaneY(subAgents.length - 1) + LANE_H
    : toolY + LANE_H;
  const axisY = lastLaneBottom + 4;
  const totalH = axisY + AXIS_H;

  const toX = (i: number) => LABEL_W + i * colW;

  const ticks: number[] = [];
  for (let i = 0; i < N; i++) {
    if ((i + 1) % tickStep === 0) ticks.push(i);
  }

  return (
    <Box ref={containerRef} sx={{ mt: 0.5 }}>
      <svg width="100%" height={totalH} style={{ display: 'block', overflow: 'visible' }}>
        {/* Main agent lane */}
        <text x={LABEL_W - 4} y={toolY + TOOL_LANE_H / 2 + 4} textAnchor="end" fontSize={9} fill={colors.textSecondary}>{mainAgentLabel}</text>
        {toolRuns.map((run) => (
          <rect key={`t${run.start}`} x={toX(run.start)} y={toolY}
            width={Math.max((run.end - run.start + 1) * colW, 1)} height={TOOL_LANE_H}
            fill={LANE_TOOL_COLORS[run.value as LaneTool]} />
        ))}
        {mainModelRuns.filter((r) => r.value).map((run) => (
          <rect key={`tm${run.start}`} x={toX(run.start)} y={toolY + TOOL_LANE_H - MODEL_LINE_H}
            width={Math.max((run.end - run.start + 1) * colW, 1)} height={MODEL_LINE_H}
            fill={laneModelColor(run.value)} />
        ))}
        {mainSkillRuns.map((run) => {
          const naturalW = (run.end - run.start + 1) * colW;
          const w = Math.max(naturalW, 5);
          const cx = toX(run.start) + naturalW / 2;
          return (
            <rect key={`ts${run.start}`} data-skill={run.value}
              x={cx - w / 2} y={toolY + TOOL_LANE_H}
              width={w} height={SKILL_LINE_H}
              fill={laneSkillColor(run.value)} />
          );
        })}
        {/* SubAgent lanes — one per unique sub-agent */}
        {subAgents.map(({ id }, i) => {
          const y = subAgentLaneY(i);
          const toolRunsForAgent = subAgentRuns[i]?.runs ?? [];
          const modelRunsForAgent = subAgentModelRuns[i]?.runs ?? [];
          const skillRunsForAgent = subAgentSkillRuns[i]?.runs ?? [];
          return (
            <g key={id}>
              <text x={LABEL_W - 4} y={y + TOOL_LANE_H / 2 + 4} textAnchor="end" fontSize={9} fill={colors.textSecondary}>
                {`SubAgent ${i + 1}`}
              </text>
              {toolRunsForAgent.map((run) => (
                <rect key={`sa${i}-${run.start}`} x={toX(run.start)} y={y}
                  width={Math.max((run.end - run.start + 1) * colW, 1)} height={TOOL_LANE_H}
                  fill={LANE_TOOL_COLORS[run.value as LaneTool]} />
              ))}
              {modelRunsForAgent.filter((r) => r.value).map((run) => (
                <rect key={`sam${i}-${run.start}`} x={toX(run.start)} y={y + TOOL_LANE_H - MODEL_LINE_H}
                  width={Math.max((run.end - run.start + 1) * colW, 1)} height={MODEL_LINE_H}
                  fill={laneModelColor(run.value)} />
              ))}
              {skillRunsForAgent.map((run) => {
                const naturalW = (run.end - run.start + 1) * colW;
                const w = Math.max(naturalW, 5);
                const cx = toX(run.start) + naturalW / 2;
                return (
                  <rect key={`sas${i}-${run.start}`}
                    x={cx - w / 2} y={y + TOOL_LANE_H}
                    width={w} height={SKILL_LINE_H}
                    fill={laneSkillColor(run.value)} />
                );
              })}
            </g>
          );
        })}
        {/* Commit/Error reference lines spanning all lanes */}
        {commitTurns?.map((turn) => {
          const x = toX(turn - 1) + colW / 2;
          return (
            <line key={`rl-commit-${turn}`} x1={x} y1={0} x2={x} y2={axisY}
              stroke="#4CAF50" strokeWidth={1.5} strokeDasharray="4 2" />
          );
        })}
        {errorTurns?.map((turn) => {
          const x = toX(turn - 1) + colW / 2;
          return (
            <line key={`rl-error-${turn}`} x1={x} y1={0} x2={x} y2={axisY}
              stroke="#F44336" strokeWidth={1.5} strokeDasharray="4 2" />
          );
        })}
        {/* X-axis */}
        <line x1={LABEL_W} y1={axisY} x2={LABEL_W + plotW} y2={axisY} stroke={colors.border} strokeWidth={0.5} />
        {ticks.map((i) => {
          const x = toX(i) + colW / 2;
          return (
            <g key={i}>
              <line x1={x} y1={axisY} x2={x} y2={axisY + 3} stroke={colors.border} strokeWidth={0.5} />
              <text x={x} y={axisY + 13} textAnchor="middle" fontSize={9} fill={colors.textSecondary}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

export function TurnLaneChartLegend({
  assistantMsgs,
}: Readonly<{ assistantMsgs: readonly TrailMessage[] }>) {
  const uniqueModels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of assistantMsgs) {
      const model = m.model ?? '';
      if (!seen.has(model)) { seen.add(model); result.push(model); }
    }
    return result;
  }, [assistantMsgs]);

  const uniqueSkills = useMemo(() => {
    const seen = new Set<string>();
    for (const m of assistantMsgs) { if (m.skill) seen.add(m.skill); }
    return Array.from(seen);
  }, [assistantMsgs]);

  const usedToolCats = useMemo(() => {
    const seen = new Set<LaneTool>();
    for (const m of assistantMsgs) {
      const d = dominantTool(m.toolCalls);
      if (d !== '') seen.add(d);
    }
    return LANE_TOOL_CATS.filter((c) => seen.has(c));
  }, [assistantMsgs]);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, pl: '60px', mt: 0.5 }}>
      {uniqueModels.map((model) => (
        <Box key={model} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: laneModelColor(model) }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{model || 'unknown'}</Typography>
        </Box>
      ))}
      {uniqueSkills.map((skill) => (
        <Box key={skill} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 3, borderRadius: '1px', bgcolor: laneSkillColor(skill) }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{skill}</Typography>
        </Box>
      ))}
      {usedToolCats.map((cat) => (
        <Box key={cat} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: LANE_TOOL_COLORS[cat] }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{LANE_TOOL_LABELS[cat]}</Typography>
        </Box>
      ))}
    </Box>
  );
}
