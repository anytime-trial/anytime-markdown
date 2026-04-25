import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type {
  TrailFilter,
  TrailMessage,
  TrailPromptEntry,
  TrailSession,
} from '../parser/types';
import type { CostOptimizationData } from '../parser/types';
import type { AnalyticsPanelProps } from './AnalyticsPanel';
import type { AnalyticsData } from '../parser/types';
import { buildMessageTree } from '../parser/buildMessageTree';
import { AnalyticsPanel } from './AnalyticsPanel';
import { FilterBar } from './FilterBar';
import { PromptManager } from './PromptManager';
import { ReleasesPanel } from './ReleasesPanel';
import { SessionList } from './SessionList';
import { StatsBar } from './StatsBar';
import { TraceTree } from './TraceTree';
import { TraceTimeline } from './TraceTimeline';
import { TrailThemeProvider } from './TrailThemeContext';
import { getTokens } from './designTokens';
import { TrailLocaleProvider, useTrailI18n } from '../i18n';
import type { TrailLocale } from '../i18n';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';

import { C4ViewerCore } from '../c4/components/C4ViewerCore';
import type { C4ViewerCoreProps } from '../c4/components/C4ViewerCore';
import { MetricsPanel } from './MetricsPanel';

/** C4-related props forwarded to the embedded C4ViewerCore. */
type C4Props = Omit<C4ViewerCoreProps, 'isDark' | 'containerHeight'>;

export interface TrailViewerCoreProps {
  readonly isDark?: boolean;
  readonly locale?: TrailLocale;
  readonly sessions: readonly TrailSession[];
  readonly allSessions?: readonly TrailSession[];
  readonly selectedSessionId?: string;
  readonly messages: readonly TrailMessage[];
  readonly filter: TrailFilter;
  readonly onSelectSession: (id: string) => void;
  readonly onFilterChange: (filter: TrailFilter) => void;
  readonly containerHeight?: string;
  readonly prompts?: readonly TrailPromptEntry[];
  readonly analytics?: AnalyticsData | null;
  readonly fetchSessionMessages?: AnalyticsPanelProps['fetchSessionMessages'];
  readonly fetchSessionCommits?: AnalyticsPanelProps['fetchSessionCommits'];
  readonly fetchSessionToolMetrics?: AnalyticsPanelProps['fetchSessionToolMetrics'];
  readonly fetchDayToolMetrics?: AnalyticsPanelProps['fetchDayToolMetrics'];
  readonly costOptimization?: CostOptimizationData | null;
  readonly releases?: readonly TrailRelease[];
  readonly fetchCombinedData?: AnalyticsPanelProps['fetchCombinedData'];
  readonly fetchQualityMetrics?: import('./MetricsPanel').MetricsPanelProps['fetchQualityMetrics'];
  readonly fetchDeploymentFrequency?: AnalyticsPanelProps['fetchDeploymentFrequency'];
  readonly fetchReleaseQuality?: AnalyticsPanelProps['fetchReleaseQuality'];
  readonly tokenBudgets?: readonly import('../hooks/useTrailDataSource').TokenBudgetStatus[];
  /** C4 viewer props. When provided, the C4 tab is shown. */
  readonly c4?: C4Props;
}

const SESSION_LIST_WIDTH = 300;

export function TrailViewerCore(props: Readonly<TrailViewerCoreProps>) {
  return (
    <TrailLocaleProvider locale={props.locale}>
      <TrailThemeProvider isDark={props.isDark ?? true}>
        <TrailViewerCoreInner {...props} />
      </TrailThemeProvider>
    </TrailLocaleProvider>
  );
}

function TrailViewerCoreInner({
  isDark,
  sessions,
  allSessions,
  selectedSessionId,
  messages,
  filter,
  onSelectSession,
  onFilterChange,
  containerHeight = 'calc(100vh - 64px)',
  prompts = [],
  analytics = null,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
  costOptimization = null,
  releases = [],
  fetchCombinedData,
  fetchQualityMetrics,
  fetchDeploymentFrequency,
  fetchReleaseQuality,
  tokenBudgets = [],
  c4,
}: Readonly<TrailViewerCoreProps>) {
  const { t } = useTrailI18n();
  const tokens = useMemo(() => getTokens(isDark ?? true), [isDark]);
  const { colors, scrollbarSx } = tokens;
  const [activeTab, setActiveTab] = useState(0);

  const visibleSessions = useMemo(() => {
    let result: readonly TrailSession[] = allSessions ?? sessions;
    const q = filter.searchText?.trim().toLowerCase();
    const skipCutoff = process.env.NEXT_PUBLIC_SHOW_UNLIMITED === '1' || !!q;
    if (!skipCutoff) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      result = result.filter((s) => new Date(s.startTime) >= cutoff);
    }
    if (filter.project) {
      result = result.filter((s) => s.project === filter.project);
    }
    if (q) {
      result = result.filter((s) => {
        const haystack = [s.slug, s.id, s.project, s.gitBranch, s.model]
          .filter((v): v is string => typeof v === 'string')
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [sessions, allSessions, filter.project, filter.searchText]);

  const handleJumpToTrace = useCallback(
    (session: TrailSession) => {
      const query = session.slug || session.id;
      onFilterChange({ ...filter, project: session.project, searchText: query });
      onSelectSession(session.id);
      setActiveTab(1);
    },
    [filter, onFilterChange, onSelectSession],
  );

  const selectedSession =
    (allSessions ?? sessions).find((s) => s.id === selectedSessionId)
    ?? visibleSessions.find((s) => s.id === selectedSessionId);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: containerHeight,
        overflow: 'hidden',
        bgcolor: colors.midnightNavy,
        color: colors.textPrimary,
        position: 'relative',
      }}
    >
      {/* aria-live region for screen reader announcements */}
      <Box
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {selectedSessionId && messages.length > 0
          ? `${messages.length} ${t('stats.messages')} ${t('viewer.loaded')}`
          : ''}
      </Box>

      {/* Top: Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: colors.border, display: 'flex', alignItems: 'center' }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v: number) => setActiveTab(v)}
          aria-label="Trail viewer tabs"
          sx={{
            flex: 1,
            '& .MuiTab-root': { color: colors.textSecondary },
            '& .Mui-selected': { color: colors.iceBlue },
            '& .MuiTabs-indicator': { backgroundColor: colors.iceBlue },
          }}
        >
          <Tab id="trail-tab-0" aria-controls="trail-panel-0" label={t('viewer.analytics')} />
          <Tab id="trail-tab-1" aria-controls="trail-panel-1" label={t('viewer.traces')} />
          <Tab id="trail-tab-2" aria-controls="trail-panel-2" label={t('viewer.prompts')} />
          <Tab id="trail-tab-3" aria-controls="trail-panel-3" label={t('releases.title')} />
          <Tab id="trail-tab-4" aria-controls="trail-panel-4" label={t('metrics.title')} />
          {c4 && <Tab id="trail-tab-5" aria-controls="trail-panel-5" label={t('viewer.c4')} />}
        </Tabs>
        {tokenBudgets.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 2, flexShrink: 0 }}>
            {tokenBudgets.map((tb, idx) => (
              <Box key={tb.sessionId} sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {idx > 0 && <Box sx={{ width: '1px', height: 24, bgcolor: colors.border, flexShrink: 0 }} />}
                <SessionBudgetBadge tokenBudget={tb} colors={colors} />
              </Box>
            ))}
            <Box sx={{ width: '1px', height: 24, bgcolor: colors.border, flexShrink: 0 }} />
            <TokenBudgetIndicator
              label={t('tokenBudget.daily')}
              current={tokenBudgets[0].dailyTokens}
              limit={tokenBudgets[0].dailyLimitTokens}
              threshold={tokenBudgets[0].alertThresholdPct}
              colors={colors}
            />
          </Box>
        )}
      </Box>

      <Box
        role="tabpanel"
        id="trail-panel-0"
        aria-labelledby="trail-tab-0"
        sx={{ display: activeTab !== 0 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <AnalyticsPanel
          analytics={analytics}
          sessions={allSessions ?? sessions}
          onSelectSession={onSelectSession}
          onJumpToTrace={handleJumpToTrace}
          fetchSessionMessages={fetchSessionMessages}
          fetchSessionCommits={fetchSessionCommits}
          fetchSessionToolMetrics={fetchSessionToolMetrics}
          fetchDayToolMetrics={fetchDayToolMetrics}
          costOptimization={costOptimization}
          fetchCombinedData={fetchCombinedData}
          fetchQualityMetrics={fetchQualityMetrics}
          fetchDeploymentFrequency={fetchDeploymentFrequency}
          fetchReleaseQuality={fetchReleaseQuality}
        />
      </Box>

      <Box
        role="tabpanel"
        id="trail-panel-1"
        aria-labelledby="trail-tab-1"
        sx={{ display: activeTab !== 1 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        {/* FilterBar */}
        <FilterBar
          filter={filter}
          sessions={allSessions ?? sessions}
          onChange={onFilterChange}
        />

        {/* SessionList + Content area */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Box
            sx={{
              width: SESSION_LIST_WIDTH,
              minWidth: SESSION_LIST_WIDTH,
              borderRight: 1,
              borderColor: colors.border,
              overflowY: 'auto',
              ...scrollbarSx,
            }}
          >
            <SessionList
              sessions={visibleSessions}
              selectedId={selectedSessionId}
              onSelect={onSelectSession}
            />
          </Box>

          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <TraceTimeline
              nodes={buildMessageTree(messages)}
              session={selectedSession}
              onSelectMessage={() => { /* scroll handled inside component */ }}
            />
            {selectedSessionId && messages.length > 0 ? (
              <Box sx={{ flex: 1, overflow: 'auto', ...scrollbarSx }}>
                <TraceTree nodes={buildMessageTree(messages)} />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                  {selectedSessionId ? t('viewer.loading') : t('viewer.selectSession')}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* StatsBar */}
        <StatsBar session={selectedSession} messages={messages} />
      </Box>

      <Box
        role="tabpanel"
        id="trail-panel-2"
        aria-labelledby="trail-tab-2"
        sx={{ display: activeTab !== 2 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <PromptManager prompts={prompts} />
      </Box>

      <Box
        role="tabpanel"
        id="trail-panel-3"
        aria-labelledby="trail-tab-3"
        sx={{ display: activeTab !== 3 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', ...scrollbarSx }}
      >
        <ReleasesPanel releases={releases ?? []} />
      </Box>

      <Box
        role="tabpanel"
        id="trail-panel-4"
        aria-labelledby="trail-tab-4"
        sx={{ display: activeTab !== 4 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <MetricsPanel fetchQualityMetrics={fetchQualityMetrics} />
      </Box>

      {c4 && (
        <Box
          role="tabpanel"
          id="trail-panel-5"
          aria-labelledby="trail-tab-5"
          sx={{ display: activeTab !== 5 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
        >
          <C4ViewerCore isDark={isDark} containerHeight="100%" {...c4} />
        </Box>
      )}
    </Box>
  );
}

function SessionBudgetBadge({ tokenBudget, colors }: Readonly<{
  tokenBudget: import('../hooks/useTrailDataSource').TokenBudgetStatus;
  colors: ReturnType<typeof getTokens>['colors'];
}>) {
  const color = resolveTokenColor(tokenBudget.sessionTokens, tokenBudget.sessionLimitTokens, tokenBudget.alertThresholdPct, colors);
  const tooltipText = tokenBudget.sessionLimitTokens != null
    ? `${tokenBudget.sessionTokens.toLocaleString()} / ${tokenBudget.sessionLimitTokens.toLocaleString()} tokens · ${tokenBudget.messageCount} messages`
    : `${tokenBudget.sessionTokens.toLocaleString()} tokens · ${tokenBudget.messageCount} messages`;

  return (
    <Tooltip title={tooltipText} placement="bottom">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <Typography sx={{ color: colors.textSecondary, fontSize: '0.6rem', fontFamily: 'monospace', lineHeight: 1 }}>
          {tokenBudget.sessionId.slice(0, 8)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
          <Typography sx={{ color, fontSize: '0.7rem', fontFamily: 'monospace', lineHeight: 1, fontWeight: 500 }}>
            {formatTokens(tokenBudget.sessionTokens)}
          </Typography>
          <Typography sx={{ color: colors.textSecondary, fontSize: '0.65rem', lineHeight: 1 }}>
            {tokenBudget.messageCount}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
}

interface TokenBudgetIndicatorProps {
  readonly label: string;
  readonly current: number;
  readonly limit: number | null;
  readonly threshold: number;
  readonly colors: ReturnType<typeof getTokens>['colors'];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// リミットあり: threshold未満=緑, threshold〜中間=オレンジ, 中間以上=赤
// リミットなし: <50K=緑, 50K-100K=オレンジ, >100K=赤
function resolveTokenColor(
  current: number,
  limit: number | null,
  threshold: number,
  colors: ReturnType<typeof getTokens>['colors'],
): string {
  if (limit !== null) {
    const pct = Math.min((current / limit) * 100, 100);
    const midpoint = threshold + (100 - threshold) / 2;
    if (pct >= midpoint) return colors.error;
    if (pct >= threshold) return colors.warning;
    return colors.success;
  }
  if (current >= 100_000) return colors.error;
  if (current >= 50_000) return colors.warning;
  return colors.success;
}

function TokenBudgetIndicator({ label, current, limit, threshold, colors }: Readonly<TokenBudgetIndicatorProps>) {
  const color = resolveTokenColor(current, limit, threshold, colors);

  if (limit === null) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <Typography sx={{ color: colors.textSecondary, fontSize: '0.6rem', lineHeight: 1 }}>{label}</Typography>
        <Typography sx={{ color, fontSize: '0.7rem', fontFamily: 'monospace', lineHeight: 1, fontWeight: 500 }}>{formatTokens(current)}</Typography>
      </Box>
    );
  }

  const pct = Math.min((current / limit) * 100, 100);
  const tooltipText = `${current.toLocaleString()} / ${limit.toLocaleString()} tokens`;

  return (
    <Tooltip title={tooltipText} placement="bottom">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <Typography sx={{ color: colors.textSecondary, fontSize: '0.6rem', lineHeight: 1 }}>{label}</Typography>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ width: 40, height: 2, borderRadius: 1, bgcolor: colors.border, '& .MuiLinearProgress-bar': { bgcolor: color } }}
        />
        <Typography sx={{ color, fontSize: '0.6rem', fontFamily: 'monospace', lineHeight: 1 }}>
          {formatTokens(current)}/{formatTokens(limit)}
        </Typography>
      </Box>
    </Tooltip>
  );
}
