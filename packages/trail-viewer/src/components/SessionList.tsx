import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';

import { formatLocalDateTime } from '@anytime-markdown/trail-core/formatDate';
import type { TrailSession } from '../parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';

interface SessionListProps {
  readonly sessions: readonly TrailSession[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}

function formatSessionLabel(session: TrailSession): string {
  return session.slug || session.id.slice(0, 8);
}

function formatSessionDate(startTime: string): string {
  return formatLocalDateTime(startTime);
}

export function SessionList({ sessions, selectedId, onSelect }: Readonly<SessionListProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();
  const handleSelect = useCallback(
    (id: string) => () => {
      onSelect(id);
    },
    [onSelect],
  );

  if (sessions.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary, p: 2 }}>
          {t('sessionList.noSessions')}
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
          sx={{
            alignItems: 'flex-start',
            '&.Mui-selected': { bgcolor: colors.iceBlueBg },
            '&.Mui-selected:hover': { bgcolor: colors.iceBlueSubtle },
            '&:hover': { bgcolor: colors.hoverBg },
          }}
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
                    label={`${session.messageCount} ${t('sessionList.messages')}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem', borderColor: colors.iceBlue }}
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
