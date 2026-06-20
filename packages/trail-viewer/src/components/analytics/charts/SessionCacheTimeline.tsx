import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { TrailMessage, TrailSession } from '../../../domain/parser/types';
import {
  countCompactDrops,
  dominantTool,
  extractPrefixWithScope,
  parseCommitSubject,
} from '../../../domain/analytics/calculators';
import { getMainAgentLabel } from '../helpers';
import type { CommitMarkerData, ErrorMarkerData } from '../types';
import { StackedReferenceLines } from './shared/StackedReferenceLines';
import { TurnLaneChart, TurnLaneChartLegend } from './TurnLaneChart';
import { AnytimeChartView } from './AnytimeChartView';

export function SessionCacheTimeline({
  messages,
  session,
}: Readonly<{
  messages: readonly TrailMessage[];
  session: TrailSession;
}>) {
  const { colors, chartColors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const assistantMsgs = messages.filter((m) => m.type === 'assistant' && m.usage);
  const hasData = assistantMsgs.length > 0;
  const compactDrops = useMemo(() => countCompactDrops(assistantMsgs), [assistantMsgs]);
  const [mode, setMode] = useState<'tool' | 'skill'>('tool');
  const mainAgentLabel = getMainAgentLabel(session.source);

  const byUuid = useMemo(() => {
    const map = new Map<string, TrailMessage>();
    for (const m of messages) map.set(m.uuid, m);
    return map;
  }, [messages]);

  const dataset = useMemo(() => {
    let cumulativeMs = 0;
    let currentSkill = '';
    return assistantMsgs.map((m, i) => {
      const parent = m.parentUuid ? byUuid.get(m.parentUuid) : undefined;
      const apiInferenceMs = (parent?.timestamp && m.timestamp)
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
  }, [assistantMsgs, byUuid]);

  const agentIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const m of assistantMsgs) {
      if (m.agentId && !map.has(m.agentId)) map.set(m.agentId, ++idx);
    }
    return map;
  }, [assistantMsgs]);

  const commitMarkers = useMemo<readonly CommitMarkerData[]>(() =>
    assistantMsgs.flatMap((m, i) => {
      if (!((m.triggerCommitHashes && m.triggerCommitHashes.length > 0) || m.hasCommit)) return [];
      const agentLabel = m.agentId ? `SubAgent ${agentIndexMap.get(m.agentId) ?? '?'}` : mainAgentLabel;
      const commitHash = m.triggerCommitHashes?.[0]?.slice(0, 8) ?? '';
      const bashCmd = m.toolCalls?.find((tc) => tc.name === 'Bash')?.input?.command;
      const subject = typeof bashCmd === 'string' ? parseCommitSubject(bashCmd) : '';
      const commitPrefix = extractPrefixWithScope(subject);
      return [{ turn: i + 1, agentLabel, commitHash, commitPrefix }];
    }),
    [assistantMsgs, agentIndexMap, mainAgentLabel],
  );

  const errorMarkers = useMemo<readonly ErrorMarkerData[]>(() =>
    assistantMsgs.flatMap((m, i) => {
      if (!m.hasToolError) return [];
      const agentLabel = m.agentId ? `SubAgent ${agentIndexMap.get(m.agentId) ?? '?'}` : mainAgentLabel;
      const toolName = dominantTool(m.toolCalls) || m.toolCalls?.[0]?.name || '';
      return [{ turn: i + 1, agentLabel, toolName }];
    }),
    [assistantMsgs, agentIndexMap, mainAgentLabel],
  );

  const commitTurns = useMemo(() => commitMarkers.map((m) => m.turn), [commitMarkers]);
  const errorTurns = useMemo(() => errorMarkers.map((m) => m.turn), [errorMarkers]);

  const totalTurns = dataset.length;
  const tickStep = totalTurns <= 5 ? 1
    : totalTurns <= 10 ? 2
    : totalTurns <= 25 ? 5
    : totalTurns <= 50 ? 10
    : totalTurns <= 100 ? 20
    : totalTurns <= 250 ? 50
    : totalTurns <= 500 ? 100
    : totalTurns <= 1000 ? 200
    : 500;

  // ターン番号は tickStep 間隔のみ表示（空文字で間引き、棒位置は維持）。
  const tokensSpec = useMemo<ChartSpec>(() => {
    const cats = dataset.map((d) => (d.turn % tickStep === 0 ? String(d.turn) : ''));
    const bar: Series = mode === 'tool'
      ? { name: t('analytics.chartToolUsageTokens'), type: 'bar', axis: 'right', color: chartColors.toolExec, values: dataset.map((d) => d.toolUsageTokens) }
      : { name: t('analytics.chartSkillUsageTokens'), type: 'bar', axis: 'right', color: chartColors.skill, values: dataset.map((d) => d.skillUsageTokens) };
    const lines: Series[] = [
      { name: t('analytics.chartInput'), type: 'line', color: chartColors.input, values: dataset.map((d) => d.inputTokens) },
      { name: t('analytics.chartOutput'), type: 'line', color: chartColors.output, values: dataset.map((d) => d.outputTokens) },
      { name: t('analytics.chartCacheRead'), type: 'line', color: chartColors.cacheRead, values: dataset.map((d) => d.cacheReadTokens) },
      { name: t('analytics.chartCacheWrite'), type: 'line', color: chartColors.cacheWrite, values: dataset.map((d) => d.cacheCreationTokens) },
    ];
    return { kind: 'combo', categories: cats, series: [bar, ...lines], options: {} };
  }, [dataset, mode, chartColors, t, tickStep]);

  const timingSpec = useMemo<ChartSpec>(() => {
    const cats = dataset.map((d) => (d.turn % tickStep === 0 ? String(d.turn) : ''));
    const cumLine: Series = { name: t('analytics.chartCumulativeInferenceTime'), type: 'line', axis: 'right', color: chartColors.cumulativeTime, values: dataset.map((d) => d.cumulativeMs) };
    const series: Series[] = mode === 'tool'
      ? [
          { name: t('analytics.chartApiInferenceTime'), type: 'bar', color: chartColors.apiInference, values: dataset.map((d) => d.apiInferenceMs) },
          { name: t('analytics.chartToolExecTime'), type: 'bar', color: chartColors.toolExec, values: dataset.map((d) => d.toolExecMs) },
          cumLine,
        ]
      : [
          { name: t('analytics.chartSkillExecTime'), type: 'bar', color: chartColors.skill, values: dataset.map((d) => d.skillExecMs) },
          cumLine,
        ];
    return { kind: 'combo', categories: cats, series, options: { stacked: mode === 'tool' } };
  }, [dataset, mode, chartColors, t, tickStep]);

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2">
          {t('analytics.sessionCacheTimelineTitle')} {hasData && `(${assistantMsgs.length} ${t('analytics.turns')})`}
        </Typography>
        {compactDrops >= 2 && (
          <Tooltip title={t('analytics.compactLoopTooltip')}>
            <Chip
              label={`⚠ Compact ×${compactDrops}`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v: 'tool' | 'skill' | null) => { if (v) setMode(v); }}
          sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: '0.7rem' } }}
        >
          <Tooltip title={t('analytics.modeTool.description')} arrow placement="top">
            <ToggleButton value="tool">{t('analytics.modeTool')}</ToggleButton>
          </Tooltip>
          <Tooltip title={t('analytics.modeSkill.description')} arrow placement="top">
            <ToggleButton value="skill">{t('analytics.modeSkill')}</ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Box>
      {hasData ? (
        <>
        <Box sx={{ position: 'relative' }}>
          <AnytimeChartView spec={tokensSpec} height={200} />
          <AnytimeChartView spec={timingSpec} height={140} />
          <TurnLaneChart
            assistantMsgs={assistantMsgs}
            tickStep={tickStep}
            commitTurns={commitTurns}
            errorTurns={errorTurns}
            mainAgentLabel={mainAgentLabel}
          />
          <StackedReferenceLines
            commitTurns={commitTurns}
            errorTurns={errorTurns}
            totalTurns={totalTurns}
          />
        </Box>
        <TurnLaneChartLegend assistantMsgs={assistantMsgs} />
        </>
      ) : (
        <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${colors.border}`, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {t('analytics.noTokenData')}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
