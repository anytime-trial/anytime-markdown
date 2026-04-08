import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { format } from 'date-fns';
import { useCallback } from 'react';

import type { TrailSession } from '../parser/types';

interface SessionListProps {
  readonly sessions: readonly TrailSession[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}

function formatSessionLabel(session: TrailSession): string {
  return session.slug || session.id.slice(0, 8);
}

function formatSessionDate(startTime: string): string {
  if (!startTime) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy/MM/dd HH:mm');
}

export function SessionList({ sessions, selectedId, onSelect }: Readonly<SessionListProps>) {
  const handleSelect = useCallback(
    (id: string) => () => {
      onSelect(id);
    },
    [onSelect],
  );

  if (sessions.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No sessions found
        </Typography>
      </Box>
    );
  }

  return (
    <List dense disablePadding>
      {sessions.map((session) => (
        <ListItemButton
          key={session.id}
          selected={session.id === selectedId}
          onClick={handleSelect(session.id)}
          sx={{ alignItems: 'flex-start' }}
        >
          <ListItemText
            primary={formatSessionLabel(session)}
            secondary={
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" component="span" color="text.secondary">
                  {session.gitBranch} &middot; {formatSessionDate(session.startTime)}
                </Typography>
                <Box component="span">
                  <Chip
                    label={`${session.messageCount} messages`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                </Box>
              </Box>
            }
            secondaryTypographyProps={{ component: 'div' }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}
