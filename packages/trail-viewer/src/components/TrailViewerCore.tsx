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
import { buildMessageTree } from '../parser/buildMessageTree';
import { FilterBar } from './FilterBar';
import { PromptManager } from './PromptManager';
import { SessionList } from './SessionList';
import { StatsBar } from './StatsBar';
import { TraceTree } from './TraceTree';

export interface TrailViewerCoreProps {
  readonly isDark?: boolean;
  readonly sessions: readonly TrailSession[];
  readonly selectedSessionId?: string;
  readonly messages: readonly TrailMessage[];
  readonly filter: TrailFilter;
  readonly onSelectSession: (id: string) => void;
  readonly onFilterChange: (filter: TrailFilter) => void;
  readonly containerHeight?: string;
  readonly prompts?: readonly TrailPromptEntry[];
}

const SESSION_LIST_WIDTH = 300;

export function TrailViewerCore({
  isDark,
  sessions,
  selectedSessionId,
  messages,
  filter,
  onSelectSession,
  onFilterChange,
  containerHeight = 'calc(100vh - 64px)',
  prompts = [],
}: Readonly<TrailViewerCoreProps>) {
  const [activeTab, setActiveTab] = useState(0);
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: containerHeight,
        overflow: 'hidden',
      }}
    >
      {/* Top: Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v: number) => setActiveTab(v)}
          aria-label="Trail viewer tabs"
        >
          <Tab label="Traces" />
          <Tab label="Prompts" />
        </Tabs>
      </Box>

      {/* Tab 0: Traces */}
      {activeTab === 0 && (
        <>
          {/* FilterBar */}
          <FilterBar
            filter={filter}
            sessions={sessions}
            onChange={onFilterChange}
          />

          {/* SessionList + Content area */}
          <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Box
              sx={{
                width: SESSION_LIST_WIDTH,
                minWidth: SESSION_LIST_WIDTH,
                borderRight: 1,
                borderColor: 'divider',
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
                <TraceTree nodes={buildMessageTree(messages)} />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant="body2" color="text.secondary">
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

      {/* Tab 1: Prompts */}
      {activeTab === 1 && <PromptManager prompts={prompts} isDark={isDark} />}
    </Box>
  );
}
