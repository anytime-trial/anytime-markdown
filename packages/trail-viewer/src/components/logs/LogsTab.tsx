import { useMemo, useState } from 'react';
import { useLogsDataSource, type LogFilter, type WsSubscribe } from '../../hooks/useLogsDataSource';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountLogsView, type LogsViewProps } from '../../views/logs/logsView';

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

/**
 * logs タブの React 境界。データソース（useLogsDataSource）と mode/filter/autoScroll を保持し、
 * 表示は VanillaIsland 経由で vanilla view（mountLogsView）へ委譲する。
 * S5 で hooks が vanilla 化したらこの薄いラッパごと撤去する。
 */
export function LogsTab(props: Readonly<Props>): React.ReactElement {
  const { t } = useTrailI18n();
  const [mode, setMode] = useState<'live' | 'history'>('live');
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_FILTER);
  const [autoScroll, setAutoScroll] = useState(true);

  const subscribe = useMemo(() => props.subscribe, [props.subscribe]);
  const ds = useLogsDataSource({
    mode,
    filter,
    baseUrl: props.baseUrl,
    subscribe,
  });

  // vanilla view は動的キー（`logs.level.${lv}` 等）を string で渡すため、境界で型を緩める。
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: LogsViewProps = {
    t: tStr,
    mode,
    filter,
    autoScroll,
    logs: ds.logs,
    paused: ds.paused,
    pendingCount: ds.pendingCount,
    nextCursor: ds.nextCursor,
    onModeChange: setMode,
    onFilterChange: setFilter,
    onAutoScrollChange: setAutoScroll,
    onPause: ds.pause,
    onResume: ds.resume,
    onClear: ds.clear,
    onLoadMore: () => void ds.loadMore(),
    onOpenOutputChannel: props.onOpenOutputChannel,
  };

  return <VanillaIsland mount={mountLogsView} props={viewProps} />;
}
