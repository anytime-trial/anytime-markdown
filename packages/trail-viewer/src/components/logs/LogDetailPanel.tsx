import { Box, Button, Stack, Typography } from '../../ui';
import { useTrailI18n } from '../../i18n';
import type { LogEntry } from '../../c4/hooks/c4WsMessages';

interface Props {
  log: LogEntry | null;
  onOpenOutputChannel?: () => void;
}

export function LogDetailPanel(props: Readonly<Props>): React.ReactElement | null {
  const { t } = useTrailI18n();
  const log = props.log;
  if (!log) return null;

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        p: 1,
        maxHeight: 240,
        overflow: 'auto',
      }}
      aria-label="log-detail"
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption">
          {log.timestamp} — {log.component}
        </Typography>
        {log.source === 'extension' && props.onOpenOutputChannel && (
          <Button size="small" onClick={props.onOpenOutputChannel}>
            {t('logs.action.openOutputChannel')}
          </Button>
        )}
      </Stack>

      <Typography variant="body2" sx={{ mb: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {log.message}
      </Typography>

      {log.metadata != null && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            metadata
          </Typography>
          <Box
            component="pre"
            sx={{
              fontSize: 11,
              m: 0,
              p: 1,
              backgroundColor: 'action.hover',
              borderRadius: 1,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(log.metadata, null, 2)}
          </Box>
        </Box>
      )}

      {log.stack != null && (
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            stack
          </Typography>
          <Box
            component="pre"
            sx={{
              fontSize: 11,
              m: 0,
              p: 1,
              backgroundColor: 'action.hover',
              borderRadius: 1,
              overflow: 'auto',
            }}
          >
            {log.stack}
          </Box>
        </Box>
      )}
    </Box>
  );
}
