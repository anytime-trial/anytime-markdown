import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
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
import { BehaviorPanel } from './BehaviorPanel';
import type { BehaviorPanelProps } from './BehaviorPanel';
import { buildMessageTree } from '../parser/buildMessageTree';
import { AnalyticsPanel } from './AnalyticsPanel';
import { FilterBar } from './FilterBar';
import { PromptManager } from './PromptManager';
import { ReleasesPanel } from './ReleasesPanel';
import { SessionList } from './SessionList';
import { StatsBar } from './StatsBar';
import { TraceTree } from './TraceTree';
import { TrailThemeProvider } from './TrailThemeContext';
import { getTokens } from './designTokens';
import { TrailLocaleProvider, useTrailI18n } from '../i18n';
import type { TrailLocale } from '../i18n';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';

import { C4ViewerCore } from '../c4/components/C4ViewerCore';
import type { C4ViewerCoreProps } from '../c4/components/C4ViewerCore';

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
  readonly costOptimization?: CostOptimizationData | null;
  readonly releases?: readonly TrailRelease[];
  readonly fetchBehaviorData?: BehaviorPanelProps['fetchBehaviorData'];
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
  costOptimization = null,
  releases = [],
  fetchBehaviorData,
  c4,
}: Readonly<TrailViewerCoreProps>) {
  const { t } = useTrailI18n();
  const tokens = useMemo(() => getTokens(isDark ?? true), [isDark]);
  const { colors } = tokens;
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

  const selectedSession = visibleSessions.find((s) => s.id === selectedSessionId);

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
      <Box sx={{ borderBottom: 1, borderColor: colors.border }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v: number) => setActiveTab(v)}
          aria-label="Trail viewer tabs"
          sx={{
            '& .MuiTab-root': { color: colors.textSecondary },
            '& .Mui-selected': { color: colors.iceBlue },
            '& .MuiTabs-indicator': { backgroundColor: colors.iceBlue },
          }}
        >
          <Tab id="trail-tab-0" aria-controls="trail-panel-0" label={t('viewer.analytics')} />
          <Tab id="trail-tab-1" aria-controls="trail-panel-1" label={t('viewer.traces')} />
          <Tab id="trail-tab-2" aria-controls="trail-panel-2" label={t('viewer.prompts')} />
          <Tab id="trail-tab-3" aria-controls="trail-panel-3" label={t('releases.title')} />
          {fetchBehaviorData && <Tab id="trail-tab-4" aria-controls="trail-panel-4" label={t('behavior.title')} />}
          {c4 && <Tab id="trail-tab-5" aria-controls="trail-panel-5" label={t('viewer.c4')} />}
        </Tabs>
      </Box>

      {/* Tab 0: Analytics */}
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
          costOptimization={costOptimization}
        />
      </Box>

      {/* Tab 1: Traces */}
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
            }}
          >
            <SessionList
              sessions={visibleSessions}
              selectedId={selectedSessionId}
              onSelect={onSelectSession}
            />
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {selectedSessionId && messages.length > 0 ? (
              <TraceTree nodes={buildMessageTree(messages)} session={selectedSession} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
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

      {/* Tab 2: Prompts */}
      <Box
        role="tabpanel"
        id="trail-panel-2"
        aria-labelledby="trail-tab-2"
        sx={{ display: activeTab !== 2 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <PromptManager prompts={prompts} />
      </Box>

      {/* Tab 3: Releases */}
      <Box
        role="tabpanel"
        id="trail-panel-3"
        aria-labelledby="trail-tab-3"
        sx={{ display: activeTab !== 3 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
      >
        <ReleasesPanel releases={releases ?? []} />
      </Box>

      {/* Tab 4: Behavior */}
      {fetchBehaviorData && (
        <Box
          role="tabpanel"
          id="trail-panel-4"
          aria-labelledby="trail-tab-4"
          sx={{ display: activeTab !== 4 ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
        >
          {activeTab === 4 && <BehaviorPanel fetchBehaviorData={fetchBehaviorData} />}
        </Box>
      )}

      {/* Tab 5: C4 */}
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
