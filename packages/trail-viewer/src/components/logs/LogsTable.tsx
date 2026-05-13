import { useEffect, useRef } from 'react';
import { Box, Chip } from '@mui/material';
import type { LogEntry, LogLevel } from '../../c4/hooks/c4WsMessages';

interface Props {
  logs: ReadonlyArray<LogEntry>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  autoScroll: boolean;
}

const LEVEL_COLOR: Record<LogLevel, 'error' | 'warning' | 'info' | 'default'> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  debug: 'default',
};

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function LogsTable(props: Readonly<Props>): React.ReactElement {
  const tailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.autoScroll && tailRef.current) {
      tailRef.current.scrollIntoView({ block: 'end' });
    }
  }, [props.logs.length, props.autoScroll]);

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: 12,
      }}
      role="grid"
      aria-label="logs"
    >
      {props.logs.map((log) => {
        const hasDetail = log.metadata != null || log.stack != null;
        const isSelected = props.selectedId === log.id;
        return (
          <Box
            key={log.id}
            role="row"
            aria-rowindex={log.id}
            aria-selected={isSelected}
            onClick={() => props.onSelect(log.id)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '180px 64px 80px 140px 1fr 16px',
              gap: 1,
              px: 1,
              py: 0.25,
              cursor: 'pointer',
              backgroundColor: isSelected ? 'action.selected' : 'transparent',
              '&:hover': { backgroundColor: 'action.hover' },
              color:
                log.level === 'error'
                  ? 'error.main'
                  : log.level === 'warn'
                    ? 'warning.main'
                    : 'text.primary',
            }}
          >
            <Box sx={{ whiteSpace: 'nowrap' }} title={log.timestamp}>
              {formatTime(log.timestamp)}
            </Box>
            <Chip
              size="small"
              label={log.level}
              color={LEVEL_COLOR[log.level]}
              variant="outlined"
              sx={{ height: 18, '& .MuiChip-label': { px: 0.75, fontSize: 10 } }}
            />
            <Box>{log.source === 'extension' ? 'ext' : 'daemon'}</Box>
            <Box
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={log.component}
            >
              {log.component}
            </Box>
            <Box
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={log.message}
            >
              {log.message}
            </Box>
            <Box sx={{ opacity: hasDetail ? 0.5 : 0, textAlign: 'center' }}>●</Box>
          </Box>
        );
      })}
      <div ref={tailRef} />
    </Box>
  );
}
