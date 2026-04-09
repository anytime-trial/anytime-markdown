import { useState } from 'react';
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
import type { AnalyticsPanelProps } from './AnalyticsPanel';
import { buildMessageTree } from '../parser/buildMessageTree';
import { AnalyticsPanel } from './AnalyticsPanel';
import type { AnalyticsData } from './AnalyticsPanel';
import { FilterBar } from './FilterBar';
import { PromptManager } from './PromptManager';
import { SessionList } from './SessionList';
import { StatsBar } from './StatsBar';
import { TraceTree } from './TraceTree';
import { TrailThemeProvider } from './TrailThemeContext';
import { getTokens } from './designTokens';

export interface TrailViewerCoreProps {
  readonly isDark?: boolean;
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
}

const SESSION_LIST_WIDTH = 300;

export function TrailViewerCore({
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
}: Readonly<TrailViewerCoreProps>) {
  const tokens = getTokens(isDark ?? true);
  const { colors } = tokens;
  const [activeTab, setActiveTab] = useState(0);
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <TrailThemeProvider isDark={isDark ?? true}>
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: containerHeight,
        overflow: 'hidden',
        bgcolor: colors.midnightNavy,
        color: colors.textPrimary,
      }}
    >
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
          <Tab label="Analytics" />
          <Tab label="Traces" />
          <Tab label="Prompts" />
        </Tabs>
      </Box>

      {/* Tab 0: Analytics */}
      {activeTab === 0 && (
        <AnalyticsPanel
          analytics={analytics}
          sessions={allSessions ?? sessions}
          onSelectSession={onSelectSession}
          fetchSessionMessages={fetchSessionMessages}
          fetchSessionCommits={fetchSessionCommits}
          fetchSessionToolMetrics={fetchSessionToolMetrics}
        />
      )}

      {/* Tab 1: Traces */}
      {activeTab === 1 && (
        <>
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
                sessions={sessions}
                selectedId={selectedSessionId}
                onSelect={onSelectSession}
              />
            </Box>

            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
              }}
            >
              {selectedSessionId && messages.length > 0 ? (
                <TraceTree nodes={buildMessageTree(messages)} session={selectedSession} />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    {selectedSessionId ? 'Loading...' : 'Select a session'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* StatsBar */}
          <StatsBar session={selectedSession} messages={messages} />
        </>
      )}

      {/* Tab 2: Prompts */}
      {activeTab === 2 && <PromptManager prompts={prompts} />}
    </Box>
    </TrailThemeProvider>
  );
}
