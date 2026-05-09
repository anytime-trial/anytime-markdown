import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import type { AnalyticsPanelProps, PeriodDays } from './types';
import { OverviewCards } from './panels/OverviewCards';
import { CombinedChartsSection } from './panels/CombinedChartsSection';
import { ToolUsageChart } from './charts/ToolUsageChart';

export function AnalyticsPanel({
  analytics,
  sessions = [],
  sessionsLoading,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
  costOptimization,
  fetchCombinedData,
  fetchQualityMetrics,
  fetchReleaseQuality,
  onOpenReleasesPopup,
  onOpenPromptsPopup,
  onOpenMessagesPopup,
}: Readonly<AnalyticsPanelProps>) {
  const { t } = useTrailI18n();
  const { scrollbarSx } = useTrailTheme();
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [overviewQualityMetrics, setOverviewQualityMetrics] = useState<QualityMetrics | null>(null);

  useEffect(() => {
    if (!fetchQualityMetrics) return;
    const to = new Date();
    const from = new Date(to.getTime() - period * 86_400_000);
    void fetchQualityMetrics({ from: from.toISOString(), to: to.toISOString() }).then((result) => {
      if (result) setOverviewQualityMetrics(result);
    });
  }, [fetchQualityMetrics, period]);

  const { currentTotals, comparison } = useMemo(() => {
    if (!analytics) return { currentTotals: null, comparison: undefined };
    const now = new Date();
    const currentFrom = new Date(now.getTime() - period * 24 * 3600 * 1000);
    const previousFrom = new Date(currentFrom.getTime() - period * 24 * 3600 * 1000);

    const current = { sessions: 0, tokens: 0, cost: 0, commits: 0, loc: 0 };
    const previous = { sessions: 0, tokens: 0, cost: 0, commits: 0, loc: 0 };

    for (const d of analytics.dailyActivity) {
      const date = new Date(d.date);
      if (date >= currentFrom) {
        current.sessions += d.sessions;
        current.tokens += (d.inputTokens + d.outputTokens);
        current.cost += d.estimatedCostUsd;
        current.commits += d.commits;
        current.loc += d.linesAdded + (d.linesDeleted ?? 0);
      } else if (date >= previousFrom) {
        previous.sessions += d.sessions;
        previous.tokens += (d.inputTokens + d.outputTokens);
        previous.cost += d.estimatedCostUsd;
        previous.commits += d.commits;
        previous.loc += d.linesAdded + (d.linesDeleted ?? 0);
      }
    }

    const calcDelta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

    return {
      currentTotals: {
        ...analytics.totals,
        sessions: current.sessions,
        inputTokens: 0,
        outputTokens: current.tokens, // Using combined tokens for display
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: current.cost,
        totalCommits: current.commits,
        totalLinesAdded: current.loc,
      },
      comparison: {
        sessions: { deltaPct: calcDelta(current.sessions, previous.sessions) },
        tokens: { deltaPct: calcDelta(current.tokens, previous.tokens) },
        cost: { deltaPct: calcDelta(current.cost, previous.cost) },
        commits: { deltaPct: calcDelta(current.commits, previous.commits) },
        loc: { deltaPct: calcDelta(current.loc, previous.loc) },
      },
    };
  }, [analytics, period]);

  if (!analytics || !currentTotals) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">
          {t('analytics.loadingAnalytics')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 3, ...scrollbarSx }}>
      <OverviewCards totals={{ ...currentTotals, comparison }} sessions={sessions} qualityMetrics={overviewQualityMetrics} />
      <ToolUsageChart items={analytics.toolUsage} />
      <CombinedChartsSection
        dailyActivity={analytics.dailyActivity}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        period={period}
        setPeriod={setPeriod}
        onSelectSession={onSelectSession}
        onJumpToTrace={onJumpToTrace}
        fetchSessionMessages={fetchSessionMessages}
        fetchSessionCommits={fetchSessionCommits}
        fetchSessionToolMetrics={fetchSessionToolMetrics}
        fetchDayToolMetrics={fetchDayToolMetrics}
        costOptimization={costOptimization}
        fetchCombinedData={fetchCombinedData}
        fetchQualityMetrics={fetchQualityMetrics}
        fetchReleaseQuality={fetchReleaseQuality}
        onOpenReleasesPopup={onOpenReleasesPopup}
        onOpenPromptsPopup={onOpenPromptsPopup}
        onOpenMessagesPopup={onOpenMessagesPopup}
      />
    </Box>
  );
}
