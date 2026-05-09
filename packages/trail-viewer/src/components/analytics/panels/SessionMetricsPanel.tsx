import { useState } from 'react';
import Box from '@mui/material/Box';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics, TrailSession } from '../../../domain/parser/types';
import {
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
  const turnCount = s.assistantMessageCount ?? s.messageCount;
  const linesAdded = s.commitStats?.linesAdded ?? 0;
  const tm = toolMetrics;

  const cardStyle = { ...cardSx, p: 2, minWidth: 160, flex: '1 1 160px', textAlign: 'center' } as const;

  const usageCards = [
    { label: t('analytics.netLines'), value: s.commitStats != null ? fmtNum(linesAdded) : '—', tooltip: t('analytics.netLines.description') },
    { label: t('analytics.tokens'), value: fmtTokens(totalTokens), tooltip: t('analytics.totalTokens.description') },
    { label: t('analytics.cost'), value: fmtUsd(cost), tooltip: t('analytics.estimatedCost.description') },
    { label: t('analytics.metricErrors'), value: (s.errorCount ?? 0) > 0 ? fmtNum(s.errorCount!) : '—', tooltip: t('analytics.metricErrors.description') },
  ];

  const productivityCards = [
    { label: t('analytics.tokensPerStep'), value: turnCount > 0 ? fmtTokens(Math.round(totalTokens / turnCount)) : '—', tooltip: t('analytics.tokensPerStep.description') },
    { label: t('analytics.costPerStep'), value: turnCount > 0 ? fmtUsd(cost / turnCount) : '—', tooltip: t('analytics.costPerStep.description') },
    { label: t('analytics.tokensPerLoc'), value: linesAdded > 0 ? fmtNum(Math.round(totalTokens / linesAdded)) : '—', tooltip: t('analytics.tokensPerLoc.description') },
  ];

  const qualityCards = [
    { label: t('analytics.retryRate'), value: tm && tm.totalEdits > 0 ? fmtPercent(tm.totalRetries / tm.totalEdits) : '—', tooltip: t('analytics.retryRate.description') },
    { label: t('analytics.buildFail'), value: tm && tm.totalBuildRuns > 0 ? fmtPercent(tm.totalBuildFails / tm.totalBuildRuns) : '—', tooltip: t('analytics.buildFail.description') },
    { label: t('analytics.testFail'), value: tm && tm.totalTestRuns > 0 ? fmtPercent(tm.totalTestFails / tm.totalTestRuns) : '—', tooltip: t('analytics.testFail.description') },
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
