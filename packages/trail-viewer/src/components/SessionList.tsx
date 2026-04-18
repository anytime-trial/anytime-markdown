import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useCallback, useState } from 'react';

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

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(id).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    },
    [],
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
            pr: 1,
            '&.Mui-selected': { bgcolor: colors.iceBlueBg },
            '&.Mui-selected:hover': { bgcolor: colors.iceBlueSubtle },
            '&:hover': { bgcolor: colors.hoverBg },
          }}
        >
          <ListItemText
            primary={
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography component="span" variant="body2" sx={{ fontWeight: session.id === selectedId ? 600 : 400 }}>
                  {formatSessionLabel(session)}
                </Typography>
                <Tooltip title={copiedId === session.id ? t('sessionList.copied') : t('sessionList.copyId')}>
                  <IconButton
                    size="small"
                    onClick={handleCopyId(session.id)}
                    sx={{ p: 0.5, color: colors.textSecondary, '&:hover': { color: colors.iceBlue } }}
                    aria-label={t('sessionList.copyId')}
                  >
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            }
            secondary={
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {session.slug && (
                  <Typography variant="caption" component="span" sx={{ color: colors.textSecondary, fontFamily: 'monospace' }}>
                    {session.id.slice(0, 8)}
                  </Typography>
                )}
                <Typography variant="caption" component="span" color="text.secondary">
                  {session.gitBranch} &middot; {formatSessionDate(session.startTime)}
                </Typography>
                <Box component="span" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${session.messageCount} ${t('sessionList.messages')}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem', borderColor: colors.iceBlue }}
                  />
                  {session.errorCount != null && session.errorCount > 0 && (
                    <Chip
                      label={`${session.errorCount} errors`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem', borderColor: colors.iceBlue }}
                    />
                  )}
                  {session.subAgentCount != null && session.subAgentCount > 0 && (
                    <Chip
                      label={`${session.subAgentCount} ${t('sessionList.subAgents')}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem', borderColor: colors.iceBlue }}
                    />
                  )}
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
