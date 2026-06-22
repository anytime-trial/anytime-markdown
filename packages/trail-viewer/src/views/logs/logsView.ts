/**
 * logs ビュー本体の vanilla 版（`components/logs/LogsTab.tsx` の表示部分の素 DOM 等価）。
 *
 * toolbar / table(or empty) / loadMore / detail を縦に積む。selectedId は presentational な
 * ローカル状態としてここで保持する（データソース mode/filter/autoScroll/logs 等は props 経由で
 * React シェル（LogsTab）から注入される。S5 で hooks が vanilla 化したらシェルごと撤去予定）。
 */
import { createButton } from '@anytime-markdown/ui-core';
import type { LogEntry } from '../../c4/hooks/c4WsMessages';
import type { LogFilter } from '../../hooks/useLogsDataSource';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountLogsToolbar } from './logsToolbar';
import { mountLogsTable } from './logsTable';
import { mountLogDetailPanel } from './logDetailPanel';

export interface LogsViewProps {
  t: (key: string) => string;
  mode: 'live' | 'history';
  filter: LogFilter;
  autoScroll: boolean;
  logs: ReadonlyArray<LogEntry>;
  paused: boolean;
  pendingCount: number;
  nextCursor: string | null;
  onModeChange: (m: 'live' | 'history') => void;
  onFilterChange: (f: LogFilter) => void;
  onAutoScrollChange: (v: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onLoadMore: () => void;
  onOpenOutputChannel?: () => void;
}

export function mountLogsView(
  container: HTMLElement,
  initial: LogsViewProps,
): VanillaViewHandle<LogsViewProps> {
  let props = initial;
  let selectedId: number | null = null;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';
  container.appendChild(root);

  const toolbarHost = document.createElement('div');
  const bodyHost = document.createElement('div');
  bodyHost.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
  const loadMoreHost = document.createElement('div');
  const detailHost = document.createElement('div');
  root.append(toolbarHost, bodyHost, loadMoreHost, detailHost);

  const toolbar = mountLogsToolbar(toolbarHost, toolbarProps());

  // table は logs があるときだけ mount する（empty 表示と排他）。
  let table: VanillaViewHandle<{
    logs: ReadonlyArray<LogEntry>;
    selectedId: number | null;
    onSelect: (id: number) => void;
    autoScroll: boolean;
  }> | null = null;
  const empty = document.createElement('div');
  empty.style.cssText = 'padding:32px;text-align:center;color:var(--am-color-text-secondary);flex:1;';

  const detail = mountLogDetailPanel(detailHost, {
    t: props.t,
    log: null,
    onOpenOutputChannel: props.onOpenOutputChannel,
  });

  function toolbarProps() {
    return {
      t: props.t,
      mode: props.mode,
      onModeChange: props.onModeChange,
      filter: props.filter,
      onFilterChange: props.onFilterChange,
      paused: props.paused,
      pendingCount: props.pendingCount,
      onPause: props.onPause,
      onResume: props.onResume,
      onClear: props.onClear,
      autoScroll: props.autoScroll,
      onAutoScrollChange: props.onAutoScrollChange,
    };
  }

  function selectedLog(): LogEntry | null {
    return props.logs.find((l) => l.id === selectedId) ?? null;
  }

  function renderBody(): void {
    if (props.logs.length === 0) {
      if (table) {
        table.destroy();
        table = null;
      }
      empty.textContent = props.t('logs.empty');
      if (!empty.isConnected) bodyHost.appendChild(empty);
      return;
    }
    if (empty.isConnected) empty.remove();
    const tableProps = {
      logs: props.logs,
      selectedId,
      onSelect: (id: number) => {
        selectedId = id;
        table?.update({ ...tableProps, selectedId });
        detail.update({ t: props.t, log: selectedLog(), onOpenOutputChannel: props.onOpenOutputChannel });
      },
      autoScroll: props.autoScroll,
    };
    if (!table) {
      table = mountLogsTable(bodyHost, tableProps);
    } else {
      table.update(tableProps);
    }
  }

  function renderLoadMore(): void {
    loadMoreHost.replaceChildren();
    if (props.mode === 'history' && props.nextCursor) {
      const wrap = document.createElement('div');
      wrap.style.cssText =
        'padding:8px;text-align:center;border-top:1px solid var(--am-color-divider);';
      const { el } = createButton({
        size: 'small',
        label: props.t('logs.action.loadMore'),
        onClick: () => props.onLoadMore(),
      });
      wrap.appendChild(el);
      loadMoreHost.appendChild(wrap);
    }
  }

  function render(): void {
    toolbar.update(toolbarProps());
    renderBody();
    renderLoadMore();
    detail.update({ t: props.t, log: selectedLog(), onOpenOutputChannel: props.onOpenOutputChannel });
  }
  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      toolbar.destroy();
      table?.destroy();
      detail.destroy();
      root.remove();
    },
  };
}
