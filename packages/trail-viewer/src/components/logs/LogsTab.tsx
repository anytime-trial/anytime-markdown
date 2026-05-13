import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { LogsToolbar } from './LogsToolbar';
import { LogsTable } from './LogsTable';
import { LogDetailPanel } from './LogDetailPanel';
import { useLogsDataSource, type LogFilter, type WsSubscribe } from '../../hooks/useLogsDataSource';
import { useTrailI18n } from '../../i18n';

interface Props {
  /** Daemon base URL, e.g. `http://127.0.0.1:7531` */
  baseUrl: string;
  /** Subscribe handler that forwards `log-batch` WS frames. */
  subscribe: WsSubscribe;
  /** Optional callback to focus the VS Code OutputChannel. */
  onOpenOutputChannel?: () => void;
}

const DEFAULT_FILTER: LogFilter = {
  level: ['debug', 'info', 'warn', 'error'],
  source: ['extension', 'daemon'],
  q: '',
};

export function LogsTab(props: Readonly<Props>): React.ReactElement {
  const { t } = useTrailI18n();
  const [mode, setMode] = useState<'live' | 'history'>('live');
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_FILTER);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const subscribe = useMemo(() => props.subscribe, [props.subscribe]);
  const ds = useLogsDataSource({
    mode,
    filter,
    baseUrl: props.baseUrl,
    subscribe,
  });

  const selected = ds.logs.find((l) => l.id === selectedId) ?? null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <LogsToolbar
        mode={mode}
        onModeChange={setMode}
        filter={filter}
        onFilterChange={setFilter}
        paused={ds.paused}
        pendingCount={ds.pendingCount}
        onPause={ds.pause}
        onResume={ds.resume}
        onClear={ds.clear}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
      />
      {ds.logs.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary', flex: 1 }}>
          <Typography>{t('logs.empty')}</Typography>
        </Box>
      ) : (
        <LogsTable
          logs={ds.logs}
          selectedId={selectedId}
          onSelect={setSelectedId}
          autoScroll={autoScroll}
        />
      )}
      {mode === 'history' && ds.nextCursor && (
        <Box sx={{ p: 1, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
          <Button size="small" onClick={() => void ds.loadMore()}>
            {t('logs.action.loadMore')}
          </Button>
        </Box>
      )}
      <LogDetailPanel log={selected} onOpenOutputChannel={props.onOpenOutputChannel} />
    </Box>
  );
}
