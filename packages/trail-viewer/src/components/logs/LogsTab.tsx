import { useMemo } from 'react';
import type { WsSubscribe } from '../../hooks/useLogsDataSource';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountLogsTab } from '../../views/logs/logsTab';

interface Props {
  /** Daemon base URL, e.g. `http://127.0.0.1:7531` */
  baseUrl: string;
  /** Subscribe handler that forwards `log-batch` WS frames. */
  subscribe: WsSubscribe;
  /** Optional callback to focus the VS Code OutputChannel. */
  onOpenOutputChannel?: () => void;
}

/**
 * logs タブの React 境界（薄いラッパ）。
 * データソース・状態管理は vanilla mount（mountLogsTab）へ移譲済み。
 */
export function LogsTab(props: Readonly<Props>): React.ReactElement {
  const { t } = useTrailI18n();

  // vanilla view は動的キー（`logs.level.${lv}` 等）を string で渡すため、境界で型を緩める。
  const tStr = useMemo(
    () =>
      (key: string): string =>
        t(key as Parameters<typeof t>[0]),
    [t],
  );

  return (
    <VanillaIsland
      mount={mountLogsTab}
      props={{
        baseUrl: props.baseUrl,
        subscribe: props.subscribe,
        onOpenOutputChannel: props.onOpenOutputChannel,
        t: tStr,
      }}
    />
  );
}
