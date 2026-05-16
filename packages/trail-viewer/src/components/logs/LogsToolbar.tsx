import {
  Box,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTrailI18n } from '../../i18n';
import type { LogFilter } from '../../hooks/useLogsDataSource';
import type { LogLevel, LogSource } from '../../c4/hooks/c4WsMessages';

interface Props {
  mode: 'live' | 'history';
  onModeChange: (m: 'live' | 'history') => void;
  filter: LogFilter;
  onFilterChange: (f: LogFilter) => void;
  paused: boolean;
  pendingCount: number;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
}

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const ALL_SOURCES: LogSource[] = ['extension', 'daemon'];

export function LogsToolbar(props: Readonly<Props>): React.ReactElement {
  const { t } = useTrailI18n();
  return (
    <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ rowGap: 1 }}>
        <ToggleButtonGroup
          size="small"
          value={props.mode}
          exclusive
          onChange={(_, v) => v && props.onModeChange(v as 'live' | 'history')}
          aria-label="mode"
        >
          <ToggleButton value="live">{t('logs.mode.live')}</ToggleButton>
          <ToggleButton value="history">{t('logs.mode.history')}</ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          value={[...props.filter.level]}
          onChange={(_, levels: LogLevel[] | null) =>
            props.onFilterChange({ ...props.filter, level: levels ?? [] })
          }
          aria-label="level"
        >
          {ALL_LEVELS.map((lv) => (
            <ToggleButton key={lv} value={lv}>
              {t(`logs.level.${lv}` as const)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <ToggleButtonGroup
          size="small"
          value={[...props.filter.source]}
          onChange={(_, sources: LogSource[] | null) =>
            props.onFilterChange({ ...props.filter, source: sources ?? [] })
          }
          aria-label="source"
        >
          {ALL_SOURCES.map((s) => (
            <ToggleButton key={s} value={s}>
              {t(`logs.source.${s}` as const)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder={t('logs.filter.search')}
          value={props.filter.q}
          onChange={(e) => props.onFilterChange({ ...props.filter, q: e.target.value })}
          sx={{ minWidth: 200, flexGrow: 1 }}
        />

        {props.mode === 'live' && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={props.paused ? t('logs.action.resume') : t('logs.action.pause')}>
              <IconButton
                size="small"
                onClick={props.paused ? props.onResume : props.onPause}
                aria-label={props.paused ? 'resume' : 'pause'}
              >
                {props.paused ? '▶' : '⏸'}
              </IconButton>
            </Tooltip>
            <Tooltip title={t('logs.action.clear')}>
              <IconButton size="small" onClick={props.onClear} aria-label="clear">
                🗑
              </IconButton>
            </Tooltip>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={props.autoScroll}
                  onChange={(e) => props.onAutoScrollChange(e.target.checked)}
                />
              }
              label={t('logs.action.autoScroll')}
              sx={{ mr: 0 }}
            />
            {props.paused && props.pendingCount > 0 && (
              <Typography variant="caption" sx={{ color: 'warning.main' }}>
                {t('logs.paused').replace('{{count}}', String(props.pendingCount))}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
