import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { TrailFilter, TrailMessage, TrailSession } from '../parser/types';
import { FilterBar } from './FilterBar';
import { SessionList } from './SessionList';
import { StatsBar } from './StatsBar';

export interface TrailViewerCoreProps {
  readonly isDark?: boolean;
  readonly sessions: readonly TrailSession[];
  readonly selectedSessionId?: string;
  readonly messages: readonly TrailMessage[];
  readonly filter: TrailFilter;
  readonly onSelectSession: (id: string) => void;
  readonly onFilterChange: (filter: TrailFilter) => void;
  readonly containerHeight?: string;
}

const SESSION_LIST_WIDTH = 300;

export function TrailViewerCore({
  sessions,
  selectedSessionId,
  messages,
  filter,
  onSelectSession,
  onFilterChange,
  containerHeight = 'calc(100vh - 64px)',
}: Readonly<TrailViewerCoreProps>) {
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
      {/* Top: FilterBar */}
      <FilterBar filter={filter} sessions={sessions} onChange={onFilterChange} />

      {/* Middle: SessionList + Content area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: SessionList */}
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

        {/* Right: Content placeholder (TraceTree will be added in Task 7) */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          {selectedSessionId ? (
            <Typography variant="body2" color="text.secondary">
              {messages.length} messages loaded
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Select a session
            </Typography>
          )}
        </Box>
      </Box>

      {/* Bottom: StatsBar */}
      <StatsBar session={selectedSession} messages={messages} />
    </Box>
  );
}
