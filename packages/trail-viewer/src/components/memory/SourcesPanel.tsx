import { Box, List, ListItem, ListItemButton, ListItemText, Typography } from '../../ui';
import { useTrailI18n } from '../../i18n';
import type { ChatUiSource } from './chatReducer';

export interface SourcesPanelProps {
  readonly sources: ReadonlyArray<ChatUiSource>;
  readonly onSelect?: (source: ChatUiSource) => void;
}

export function SourcesPanel({ sources, onSelect }: Readonly<SourcesPanelProps>) {
  const { t } = useTrailI18n();
  return (
    <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', p: 1, overflowY: 'auto' }}>
      <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
        {t('memory.chat.sources.title')}
      </Typography>
      {sources.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t('memory.chat.sources.empty')}
        </Typography>
      ) : (
        <List dense disablePadding>
          {sources.map((s) => (
            <ListItem key={`${s.kind}:${s.id}`} disablePadding>
              <ListItemButton onClick={() => onSelect?.(s)}>
                <ListItemText
                  primary={s.title}
                  secondary={`${s.kind}:${s.id}`}
                  primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                  secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
