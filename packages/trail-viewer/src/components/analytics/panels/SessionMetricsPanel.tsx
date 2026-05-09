import { useState } from 'react';
import Box from '@mui/material/Box';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics, TrailSession } from '../../../domain/parser/types';
import {
  fmtDuration,
  fmtNum,
  fmtPercent,
  fmtTokens,
  fmtUsd,
} from '../../../domain/analytics/formatters';
import { sessionCost } from '../../../domain/analytics/calculators';
import { CyclingCard } from '../widgets/CyclingCard';

export function SessionMetricsPanel({ session, toolMetrics }: Readonly<{
  session: TrailSession;
  toolMetrics?: ToolMetrics | null;
}>) {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [usageIdx, setUsageIdx] = useState(0);
  const [productivityIdx, setProductivityIdx] = useState(0);
  const [qualityIdx, setQualityIdx] = useState(0);

  const s = session;
  const totalTokens = s.usage.inputTokens + s.usage.outputTokens + s.usage.cacheReadTokens + s.usage.cacheCreationTokens;
  const cost = sessionCost(s);
  const durationMs = new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
  const durationHours = durationMs / 3_600_000;
  const contextGrowth = s.messageCount > 0
    ? ((s.peakContextTokens ?? 0) - (s.initialContextTokens ?? 0)) / s.messageCount
    : 0;
  const linesAdded = s.commitStats?.linesAdded ?? 0;
  const tm = toolMetrics;

  const cardStyle = { ...cardSx, p: 2, minWidth: 160, flex: '1 1 160px', textAlign: 'center' } as const;

  const usageCards = [
    { label: t('analytics.netLines'), value: linesAdded > 0 ? fmtNum(linesAdded) : '—', tooltip: t('analytics.netLines.description') },
    { label: t('analytics.tokens'), value: fmtTokens(totalTokens), tooltip: t('analytics.totalTokens.description') },
    { label: t('analytics.cost'), value: fmtUsd(cost), tooltip: t('analytics.estimatedCost.description') },
    { label: t('analytics.metricMessages'), value: fmtNum(s.messageCount), tooltip: t('analytics.metricMessages.description') },
    { label: t('analytics.metricErrors'), value: (s.errorCount ?? 0) > 0 ? fmtNum(s.errorCount!) : '—', tooltip: t('analytics.metricErrors.description') },
    { label: t('analytics.contextGrowth'), value: s.messageCount > 0 ? `${fmtTokens(Math.round(contextGrowth))}/step` : '—', tooltip: t('analytics.contextGrowth.description') },
  ];

  const productivityCards = [
    { label: t('analytics.tokensPerStep'), value: s.messageCount > 0 ? fmtTokens(Math.round(totalTokens / s.messageCount)) : '—', tooltip: t('analytics.tokensPerStep.description') },
    { label: t('analytics.costPerStep'), value: s.messageCount > 0 ? fmtUsd(cost / s.messageCount) : '—', tooltip: t('analytics.costPerStep.description') },
    { label: t('analytics.linesPerHour'), value: durationHours > 0 && linesAdded > 0 ? fmtNum(Math.round(linesAdded / durationHours)) : '—', tooltip: t('analytics.linesPerHour.description') },
    { label: t('analytics.costPerHour'), value: durationHours > 0 ? fmtUsd(cost / durationHours) : '—', tooltip: t('analytics.costPerHour.description') },
    { label: t('analytics.costPerCommit'), value: (s.commitStats?.commits ?? 0) > 0 ? fmtUsd(cost / s.commitStats!.commits) : '—', tooltip: t('analytics.costPerCommit.description') },
    { label: t('analytics.avgInterval'), value: s.messageCount > 1 ? fmtDuration(durationMs / (s.messageCount - 1)) : '—', tooltip: t('analytics.avgInterval.description') },
  ];

  const qualityCards = [
    { label: t('analytics.retryRate'), value: tm && tm.totalEdits > 0 ? fmtPercent(tm.totalRetries / tm.totalEdits) : '—', tooltip: t('analytics.retryRate.description') },
    { label: t('analytics.buildFail'), value: tm && tm.totalBuildRuns > 0 ? fmtPercent(tm.totalBuildFails / tm.totalBuildRuns) : '—', tooltip: t('analytics.buildFail.description') },
    { label: t('analytics.testFail'), value: tm && tm.totalTestRuns > 0 ? fmtPercent(tm.totalTestFails / tm.totalTestRuns) : '—', tooltip: t('analytics.testFail.description') },
    { label: t('analytics.metricInterrupted'), value: s.interruption?.interrupted
        ? `${s.interruption.reason === 'max_tokens' ? 'max_tokens' : 'no response'} (${fmtTokens(s.interruption.contextTokens)})`
        : '—', tooltip: t('analytics.metricInterrupted.description') },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1 }}>
      <CyclingCard
        groupName={t('analytics.groupUsage')}
        items={usageCards}
        index={usageIdx}
        onCycle={() => setUsageIdx((i) => (i + 1) % usageCards.length)}
        cardStyle={cardStyle}
      />
      <CyclingCard
        groupName={t('analytics.groupProductivity')}
        items={productivityCards}
        index={productivityIdx}
        onCycle={() => setProductivityIdx((i) => (i + 1) % productivityCards.length)}
        cardStyle={cardStyle}
      />
      <CyclingCard
        groupName={t('analytics.groupQuality')}
        items={qualityCards}
        index={qualityIdx}
        onCycle={() => setQualityIdx((i) => (i + 1) % qualityCards.length)}
        cardStyle={cardStyle}
      />
    </Box>
  );
}
