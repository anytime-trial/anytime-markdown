import { mountLogsView, type LogsViewProps } from '../logsView';
import { mountLogsToolbar, type LogsToolbarProps } from '../logsToolbar';
import type { LogEntry } from '../../../c4/hooks/c4WsMessages';

const t = (key: string): string => key;

function makeLog(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    timestamp: '2026-06-21T00:00:00.000Z',
    level: 'info',
    source: 'daemon',
    component: 'comp',
    message: 'hello',
    ...over,
  };
}

function baseViewProps(over: Partial<LogsViewProps> = {}): LogsViewProps {
  return {
    t,
    mode: 'live',
    filter: { level: ['debug', 'info', 'warn', 'error'], source: ['extension', 'daemon'], q: '' },
    autoScroll: true,
    logs: [],
    paused: false,
    pendingCount: 0,
    nextCursor: null,
    onModeChange: () => {},
    onFilterChange: () => {},
    onAutoScrollChange: () => {},
    onPause: () => {},
    onResume: () => {},
    onClear: () => {},
    onLoadMore: () => {},
    ...over,
  };
}

describe('mountLogsView', () => {
  it('logs が空なら empty メッセージを出す', () => {
    const c = document.createElement('div');
    mountLogsView(c, baseViewProps());
    expect(c.textContent).toContain('logs.empty');
    expect(c.querySelector('[role="grid"]')).toBeNull();
  });

  it('logs があれば grid 行を描画し、行クリックで detail を出す', () => {
    const c = document.createElement('div');
    const handle = mountLogsView(
      c,
      baseViewProps({ logs: [makeLog({ id: 7, message: 'boom', stack: 'at x' })] }),
    );
    const grid = c.querySelector('[role="grid"]');
    expect(grid).not.toBeNull();
    const row = c.querySelector('[role="row"]') as HTMLElement;
    expect(row.getAttribute('aria-rowindex')).toBe('7');
    // クリック前は detail 非表示
    expect(c.querySelector('[aria-label="log-detail"]')).toBeNull();
    row.click();
    const detail = c.querySelector('[aria-label="log-detail"]');
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain('boom');
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('history + nextCursor で loadMore ボタンを出しコールバックする', () => {
    const c = document.createElement('div');
    let loaded = 0;
    mountLogsView(
      c,
      baseViewProps({ mode: 'history', nextCursor: 'cur', logs: [makeLog()], onLoadMore: () => (loaded += 1) }),
    );
    const btn = [...c.querySelectorAll('button')].find((b) => b.textContent?.includes('logs.action.loadMore'));
    expect(btn).toBeDefined();
    btn?.click();
    expect(loaded).toBe(1);
  });
});

describe('mountLogsToolbar', () => {
  function baseToolbarProps(over: Partial<LogsToolbarProps> = {}): LogsToolbarProps {
    return {
      t,
      mode: 'live',
      onModeChange: () => {},
      filter: { level: ['info'], source: ['daemon'], q: '' },
      onFilterChange: () => {},
      paused: false,
      pendingCount: 0,
      onPause: () => {},
      onResume: () => {},
      onClear: () => {},
      autoScroll: true,
      onAutoScrollChange: () => {},
      ...over,
    };
  }

  it('level トグルクリックで onFilterChange に追加/除去が渡る', () => {
    const c = document.createElement('div');
    let lastFilter: LogsToolbarProps['filter'] | null = null;
    mountLogsToolbar(c, baseToolbarProps({ onFilterChange: (f) => (lastFilter = f) }));
    const levelGroup = c.querySelector('[aria-label="level"]') as HTMLElement;
    const debugBtn = [...levelGroup.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('logs.level.debug'),
    );
    debugBtn?.click();
    expect(lastFilter).not.toBeNull();
    expect(lastFilter!.level).toContain('debug');
  });

  it('pause ボタンクリックで onPause を呼ぶ', () => {
    const c = document.createElement('div');
    let paused = 0;
    mountLogsToolbar(c, baseToolbarProps({ onPause: () => (paused += 1) }));
    const pauseBtn = c.querySelector('[aria-label="pause"]') as HTMLElement;
    pauseBtn.click();
    expect(paused).toBe(1);
  });

  it('history モードでは live コントロールを隠す', () => {
    const c = document.createElement('div');
    const handle = mountLogsToolbar(c, baseToolbarProps());
    const pauseBtn = c.querySelector('[aria-label="pause"]') as HTMLElement;
    const liveControls = pauseBtn.parentElement as HTMLElement;
    expect(liveControls.style.display).not.toBe('none');
    handle.update(baseToolbarProps({ mode: 'history' }));
    expect(liveControls.style.display).toBe('none');
  });
});
