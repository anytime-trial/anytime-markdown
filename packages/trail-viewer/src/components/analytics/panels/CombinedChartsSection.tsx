import { useEffect, useState } from 'react';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import type {
  AnalyticsData,
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../../domain/parser/types';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type {
  AgentMetric,
  ChartMetric,
  CombinedMetric,
  CommitMetric,
  DailyViewMode,
  PeriodDays,
} from '../types';
import { DailyActivityChart } from '../charts/DailyActivityChart';
import { ReleasesBarChart } from '../charts/ReleasesBarChart';
import { CombinedChartsContent } from '../charts/combined/CombinedChartsContent';
import { DailySessionList } from './DailySessionList';

export function CombinedChartsSection({
  dailyActivity,
  sessions,
  sessionsLoading,
  period,
  setPeriod,
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
}: Readonly<{
  dailyActivity: AnalyticsData['dailyActivity'];
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  period: PeriodDays;
  setPeriod: (v: PeriodDays) => void;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  costOptimization?: CostOptimizationData | null;
  fetchCombinedData?: (period: CombinedPeriodMode, rangeDays: CombinedRangeDays) => Promise<CombinedData>;
  fetchQualityMetrics?: (range: DateRange) => Promise<QualityMetrics | null>;
  fetchReleaseQuality?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<ReleaseQualityBucket>>;
  onOpenReleasesPopup?: () => void;
}>) {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [metric, setMetric] = useState<CombinedMetric>('tokens');
  const [tokenMode, setTokenMode] = useState<DailyViewMode>('tokens');
  const [toolMetric, setToolMetric] = useState<ChartMetric>('count');
  const [modelMetric, setModelMetric] = useState<ChartMetric>('count');
  const [agentMetric, setAgentMetric] = useState<AgentMetric>('tokens');
  const [commitMetric, setCommitMetric] = useState<CommitMetric>('count');
  const [repoMetric, setRepoMetric] = useState<ChartMetric>('count');
  const [combinedData, setCombinedData] = useState<CombinedData | null>(null);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [, setOverlayLoading] = useState(false);
  const [releasesTimeSeries, setReleasesTimeSeries] = useState<ReadonlyArray<ReleaseQualityBucket>>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [overlay, setOverlay] = useState<{
    bucket: 'day' | 'week';
    tokens: ReadonlyArray<{ bucketStart: string; value: number }>;
    cost: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTime: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimeUnmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    leadTimeByPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
    deploymentFrequency: ReadonlyArray<{ bucketStart: string; value: number }>;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => { setSelectedDate(null); }, [period]);
  const handleDateClick = (fullDate: string) => {
    setSelectedDate((prev) => (prev === fullDate ? null : fullDate));
  };

  // Prefetch behavior data so switching to Tool/Error/Skill does not block on fetch.
  useEffect(() => {
    if (!fetchCombinedData) return;
    const rangeDays: CombinedRangeDays = period >= 90 ? 90 : 30;
    const periodMode: CombinedPeriodMode = period >= 90 ? 'week' : 'day';
    let mounted = true;
    setCombinedLoading(true);
    void (async () => {
      const result = await fetchCombinedData(periodMode, rangeDays);
      if (mounted) {
        setCombinedData(result);
        setCombinedLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchCombinedData, period]);

  useEffect(() => {
    if (!fetchQualityMetrics) return;
    if (metric === 'releases') return;
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - period * 86_400_000).toISOString();
    let mounted = true;
    setOverlayLoading(true);
    void (async () => {
      const result = await fetchQualityMetrics({ from, to });
      if (mounted) {
        setOverlayLoading(false);
      }
      if (mounted && result) {
        setOverlay({
          bucket: result.bucket,
          tokens: result.metrics.tokensPerLoc.timeSeries,
          cost: result.costPerLocTimeSeries ?? [],
          leadTime: result.leadTimeMinTimeSeries ?? [],
          leadTimePerLoc: result.metrics.leadTimePerLoc.timeSeries,
          leadTimeUnmapped: result.leadTimeUnmappedTimeSeries ?? [],
          leadTimeByPrefix: result.leadTimeMinByPrefix ?? { prefixes: [], series: [] },
          deploymentFrequency: result.metrics.deploymentFrequency.timeSeries,
        });
      }
    })();
    return () => { mounted = false; };
  }, [fetchQualityMetrics, period, metric]);

  useEffect(() => {
    if (!fetchReleaseQuality) return;
    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - period * 86_400_000).toISOString();
    const bucket: 'day' | 'week' = period >= 90 ? 'week' : 'day';
    let mounted = true;
    setReleasesLoading(true);
    void (async () => {
      const result = await fetchReleaseQuality({ from, to }, bucket);
      if (mounted) {
        setReleasesTimeSeries(result);
        setReleasesLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchReleaseQuality, period]);

  const toggleSx = {
    color: colors.textSecondary,
    borderColor: colors.border,
    '&.Mui-selected': { color: colors.iceBlue, bgcolor: colors.iceBlueBg, borderColor: colors.iceBlue },
    '&:hover': { bgcolor: colors.hoverBg },
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={metric}
            exclusive
            onChange={(_e, v: CombinedMetric | null) => { if (v) setMetric(v); }}
            size="small"
          >
            <Tooltip title={t('chart.tokenUsage.description')} arrow placement="top">
              <ToggleButton value="tokens" sx={toggleSx}>{t('chart.tokenUsage')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.agent.description')} arrow placement="top">
              <ToggleButton value="agents" data-chart-kind="agents" sx={toggleSx}>{t('analytics.combined.agent')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.model.description')} arrow placement="top">
              <ToggleButton value="models" data-chart-kind="models" sx={toggleSx}>{t('analytics.combined.model')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.skill.description')} arrow placement="top">
              <ToggleButton value="skills" data-chart-kind="skills" sx={toggleSx}>{t('analytics.combined.skill')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.tool.description')} arrow placement="top">
              <ToggleButton value="tools" data-chart-kind="tools" sx={toggleSx}>{t('analytics.combined.tool')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.error.description')} arrow placement="top">
              <ToggleButton value="errors" data-chart-kind="errors" sx={toggleSx}>{t('analytics.combined.error')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.repository.description')} arrow placement="top">
              <ToggleButton value="repos" data-chart-kind="repos" sx={toggleSx}>{t('analytics.combined.repository')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.commitPrefix.description')} arrow placement="top">
              <ToggleButton value="commits" data-chart-kind="commits" sx={toggleSx}>{t('analytics.combined.commitPrefix')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.release.description')} arrow placement="top">
              <ToggleButton value="releases" sx={{ ...toggleSx, gap: 0.75, pr: 0.75 }}>
                <Box component="span">{t('analytics.combined.release')}</Box>
                <Tooltip title={t('releases.openPopup')} arrow placement="top">
                  <Box
                    component="span"
                    role="button"
                    tabIndex={onOpenReleasesPopup ? 0 : -1}
                    aria-label={t('releases.openPopup')}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenReleasesPopup?.();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenReleasesPopup?.();
                    }}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      borderRadius: 1,
                      color: colors.textSecondary,
                      opacity: onOpenReleasesPopup ? 1 : 0.35,
                      cursor: onOpenReleasesPopup ? 'pointer' : 'default',
                      '&:hover': onOpenReleasesPopup ? { bgcolor: colors.hoverBg, color: colors.iceBlue } : undefined,
                    }}
                  >
                    <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </Box>
                </Tooltip>
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_e, v: PeriodDays | null) => { if (v !== null) setPeriod(v); }}
            size="small"
          >
            <ToggleButton value={7} sx={toggleSx}>{`7${t('releases.days')}`}</ToggleButton>
            <ToggleButton value={30} sx={toggleSx}>{`30${t('releases.days')}`}</ToggleButton>
            <ToggleButton value={90} sx={toggleSx}>{`90${t('releases.days')}`}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {metric === 'tokens' && (
          <ToggleButtonGroup
            value={tokenMode}
            exclusive
            onChange={(_e, v: DailyViewMode | null) => { if (v) setTokenMode(v); }}
            size="small"
          >
            <Tooltip title={t('chart.tokens.description')} arrow placement="top">
              <ToggleButton value="tokens" sx={toggleSx}>{t('chart.tokens')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('chart.cost.description')} arrow placement="top">
              <ToggleButton value="cost" sx={toggleSx}>{t('chart.cost')}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        )}
        {metric === 'tools' && (
          <ToggleButtonGroup
            value={toolMetric}
            exclusive
            onChange={(_e, v: ChartMetric | null) => { if (v) setToolMetric(v); }}
            size="small"
          >
            <Tooltip title={t('analytics.combined.count.description')} arrow placement="top">
              <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.count')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.tokens.description')} arrow placement="top">
              <ToggleButton value="tokens" sx={toggleSx}>{t('analytics.combined.tokens')}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        )}
        {metric === 'models' && (
          <ToggleButtonGroup
            value={modelMetric}
            exclusive
            onChange={(_e, v: ChartMetric | null) => { if (v) setModelMetric(v); }}
            size="small"
          >
            <Tooltip title={t('analytics.combined.count.description')} arrow placement="top">
              <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.count')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.tokens.description')} arrow placement="top">
              <ToggleButton value="tokens" sx={toggleSx}>{t('analytics.combined.tokens')}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        )}
        {metric === 'agents' && (
          <ToggleButtonGroup
            value={agentMetric}
            exclusive
            onChange={(_e, v: AgentMetric | null) => { if (v) setAgentMetric(v); }}
            size="small"
          >
            <Tooltip title={t('analytics.combined.tokens.description')} arrow placement="top">
              <ToggleButton value="tokens" sx={toggleSx}>{t('analytics.combined.tokens')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('chart.cost.description')} arrow placement="top">
              <ToggleButton value="cost" sx={toggleSx}>{t('chart.cost')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.loc.description')} arrow placement="top">
              <ToggleButton value="loc" sx={toggleSx}>{t('analytics.combined.loc')}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        )}
        {metric === 'repos' && (
          <ToggleButtonGroup
            value={repoMetric}
            exclusive
            onChange={(_e, v: ChartMetric | null) => { if (v) setRepoMetric(v); }}
            size="small"
          >
            <Tooltip title={t('analytics.combined.count.description')} arrow placement="top">
              <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.count')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.tokens.description')} arrow placement="top">
              <ToggleButton value="tokens" sx={toggleSx}>{t('analytics.combined.tokens')}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        )}
        {metric === 'commits' && (
          <ToggleButtonGroup
            value={commitMetric}
            exclusive
            onChange={(_e, v: CommitMetric | null) => { if (v) setCommitMetric(v); }}
            size="small"
          >
            <Tooltip title={t('analytics.combined.commitCount.description')} arrow placement="top">
              <ToggleButton value="count" sx={toggleSx}>{t('analytics.combined.commitCount')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.loc.description')} arrow placement="top">
              <ToggleButton value="loc" sx={toggleSx}>{t('analytics.combined.loc')}</ToggleButton>
            </Tooltip>
            <Tooltip title={t('analytics.combined.leadTime.description')} arrow placement="top">
              <ToggleButton value="leadTime" data-chart-kind="leadTime" sx={toggleSx}>{t('analytics.combined.leadTime')}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        )}
      </Box>
      {metric === 'tokens' ? (
        <DailyActivityChart
          items={dailyActivity}
          period={period}
          mode={tokenMode}
          onDateClick={handleDateClick}
          costOptimization={costOptimization}
          overlay={overlay}
        />
      ) : metric === 'releases' ? (
        releasesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <ReleasesBarChart timeSeries={releasesTimeSeries} />
        )
      ) : fetchCombinedData ? (
        combinedLoading && !combinedData ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <CombinedChartsContent
            data={combinedData}
            periodDays={period}
            activeChart={metric}
            toolMetric={toolMetric}
            modelMetric={modelMetric}
            agentMetric={agentMetric}
            commitMetric={commitMetric}
            repoMetric={repoMetric}
            leadTimeOverlay={overlay ? { leadTimePerLoc: overlay.leadTimePerLoc, unmapped: overlay.leadTimeUnmapped, byPrefix: overlay.leadTimeByPrefix } : null}
            onDateClick={handleDateClick}
          />
        )
      ) : null}
      {selectedDate && period !== 90 && (
        <DailySessionList
          date={selectedDate}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          onSelectSession={onSelectSession}
          onJumpToTrace={onJumpToTrace}
          fetchSessionMessages={fetchSessionMessages}
          fetchSessionCommits={fetchSessionCommits}
          fetchSessionToolMetrics={fetchSessionToolMetrics}
          fetchDayToolMetrics={fetchDayToolMetrics}
        />
      )}
    </Box>
  );
}
