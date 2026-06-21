/**
 * logs ツールバーの vanilla 版（`components/logs/LogsToolbar.tsx` の素 DOM 等価）。
 *
 * mode 切替（live/history・排他）、level/source の複数選択トグル、検索 TextField、
 * live 時の pause/clear/autoScroll/pending 表示を ui-core ファクトリで再現する。
 * 再描画でのフォーカス喪失を避けるため、DOM は初回 mount で構築し update() は in-place 更新する。
 */
import {
  createIconButton,
  createStack,
  createSwitch,
  createTextField,
  createToggleButton,
  createToggleButtonGroup,
  createTooltip,
  type IconButtonHandle,
  type TextFieldHandle,
} from '@anytime-markdown/ui-core';
import type { LogFilter } from '../../hooks/useLogsDataSource';
import type { LogLevel, LogSource } from '../../c4/hooks/c4WsMessages';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const ALL_SOURCES: LogSource[] = ['extension', 'daemon'];

export interface LogsToolbarProps {
  t: (key: string) => string;
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

/** 複数選択トグル行（level / source）。クリックで配列メンバシップをトグルする。 */
function createMultiToggleRow<T extends string>(
  values: readonly T[],
  label: (v: T) => string,
  getSelected: () => readonly T[],
  onToggle: (v: T) => void,
  ariaLabel: string,
): { el: HTMLDivElement; sync: () => void } {
  const row = document.createElement('div');
  row.style.cssText = 'display:inline-flex;';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', ariaLabel);
  const buttons = values.map((v, i) => {
    const { el } = createToggleButton({
      value: v,
      size: 'small',
      label: label(v),
      onClick: () => onToggle(v),
    });
    el.style.marginLeft = i === 0 ? '0' : '-1px';
    row.appendChild(el);
    return { v, el };
  });
  const sync = (): void => {
    const selected = new Set(getSelected());
    for (const { v, el } of buttons) {
      const on = selected.has(v);
      el.setAttribute('aria-pressed', String(on));
      el.setAttribute('data-selected', String(on));
      el.style.backgroundColor = on ? 'var(--am-color-action-selected)' : '';
    }
  };
  sync();
  return { el: row, sync };
}

export function mountLogsToolbar(
  container: HTMLElement,
  initial: LogsToolbarProps,
): VanillaViewHandle<LogsToolbarProps> {
  let props = initial;
  const t = props.t;

  const root = document.createElement('div');
  root.style.cssText =
    'padding:8px;border-bottom:1px solid var(--am-color-divider);';

  const { el: rowStack } = createStack({
    direction: 'row',
    spacing: 2,
    alignItems: 'center',
  });
  rowStack.style.flexWrap = 'wrap';
  rowStack.style.rowGap = '8px';
  root.appendChild(rowStack);

  // mode（排他）
  const modeGroup = createToggleButtonGroup({
    size: 'small',
    value: props.mode,
    ariaLabel: 'mode',
    onChange: (v) => v && props.onModeChange(v as 'live' | 'history'),
  });
  modeGroup.register(createToggleButton({ value: 'live', label: t('logs.mode.live') }));
  modeGroup.register(createToggleButton({ value: 'history', label: t('logs.mode.history') }));
  rowStack.appendChild(modeGroup.el);

  // level（複数選択）
  const levelRow = createMultiToggleRow<LogLevel>(
    ALL_LEVELS,
    (lv) => t(`logs.level.${lv}`),
    () => props.filter.level,
    (lv) => {
      const has = props.filter.level.includes(lv);
      const next = has
        ? props.filter.level.filter((x) => x !== lv)
        : [...props.filter.level, lv];
      props.onFilterChange({ ...props.filter, level: next });
    },
    'level',
  );
  rowStack.appendChild(levelRow.el);

  // source（複数選択）
  const sourceRow = createMultiToggleRow<LogSource>(
    ALL_SOURCES,
    (s) => t(`logs.source.${s}`),
    () => props.filter.source,
    (s) => {
      const has = props.filter.source.includes(s);
      const next = has
        ? props.filter.source.filter((x) => x !== s)
        : [...props.filter.source, s];
      props.onFilterChange({ ...props.filter, source: next });
    },
    'source',
  );
  rowStack.appendChild(sourceRow.el);

  // 検索
  const search: TextFieldHandle = createTextField({
    size: 'small',
    placeholder: t('logs.filter.search'),
    value: props.filter.q,
    onChange: (e) =>
      props.onFilterChange({
        ...props.filter,
        q: (e.target as HTMLInputElement).value,
      }),
  });
  search.el.style.minWidth = '200px';
  search.el.style.flexGrow = '1';
  rowStack.appendChild(search.el);

  // live 専用コントロール
  const { el: liveControls } = createStack({
    direction: 'row',
    spacing: 1,
    alignItems: 'center',
  });

  const pauseBtn: IconButtonHandle = createIconButton({
    size: 'small',
    ariaLabel: props.paused ? 'resume' : 'pause',
    children: props.paused ? '▶' : '⏸',
    onClick: () => (props.paused ? props.onResume() : props.onPause()),
  });
  const pauseTip = createTooltip({
    reference: pauseBtn.el,
    title: props.paused ? t('logs.action.resume') : t('logs.action.pause'),
  });

  const clearBtn = createIconButton({
    size: 'small',
    ariaLabel: 'clear',
    children: '🗑',
    onClick: () => props.onClear(),
  });
  const clearTip = createTooltip({ reference: clearBtn.el, title: t('logs.action.clear') });

  const autoScrollSwitch = createSwitch({
    checked: props.autoScroll,
    ariaLabel: t('logs.action.autoScroll'),
    onChange: (checked) => props.onAutoScrollChange(checked),
  });
  const autoScrollLabel = document.createElement('label');
  autoScrollLabel.style.cssText =
    'display:inline-flex;align-items:center;gap:4px;font-size:0.875rem;';
  autoScrollLabel.appendChild(autoScrollSwitch.el);
  const autoScrollText = document.createElement('span');
  autoScrollText.textContent = t('logs.action.autoScroll');
  autoScrollLabel.appendChild(autoScrollText);

  const pendingText = document.createElement('span');
  pendingText.style.cssText =
    'font-size:0.75rem;color:var(--am-color-warning-main);';

  liveControls.append(pauseBtn.el, clearBtn.el, autoScrollLabel, pendingText);
  rowStack.appendChild(liveControls);

  container.appendChild(root);

  const render = (): void => {
    modeGroup.setValue(props.mode);
    levelRow.sync();
    sourceRow.sync();
    // 検索: フォーカス中はキャレット保護のため上書きしない
    if (document.activeElement !== search.input && search.input.value !== props.filter.q) {
      search.update({ value: props.filter.q });
    }
    liveControls.style.display = props.mode === 'live' ? 'inline-flex' : 'none';
    pauseBtn.update({
      ariaLabel: props.paused ? 'resume' : 'pause',
      children: props.paused ? '▶' : '⏸',
    });
    pauseTip.update({ title: props.paused ? t('logs.action.resume') : t('logs.action.pause') });
    autoScrollSwitch.update({ checked: props.autoScroll });
    if (props.paused && props.pendingCount > 0) {
      pendingText.textContent = t('logs.paused').replace('{{count}}', String(props.pendingCount));
      pendingText.style.display = '';
    } else {
      pendingText.style.display = 'none';
    }
  };
  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      modeGroup.destroy();
      search.destroy();
      pauseBtn.destroy();
      clearBtn.destroy();
      autoScrollSwitch.destroy();
      pauseTip.destroy();
      clearTip.destroy();
      root.remove();
    },
  };
}
