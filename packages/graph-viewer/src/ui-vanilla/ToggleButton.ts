/**
 * MUI ToggleButton / ToggleButtonGroup / ui/ToggleButton.tsx の vanilla DOM 置換（graph-viewer 専用）。
 *
 * - ToggleButton: button[aria-pressed]。クリックで onChange を発火。
 * - ToggleButtonGroup: role="group" 横並び flex コンテナ。
 *   子は明示 register API で登録する（React context の代替）。
 *
 * gv-toggle-btn / gv-toggle-group クラスは injectStyles.ts で定義済みを流用する。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, type VanillaContent } from './dom';

// --- ToggleButton ------------------------------------------------------------

/** Group が子へ注入する制御ハンドル（React の _onToggle / _selected 相当）。 */
export interface ToggleGroupControlHandle {
  /** 選択中の value（null は未選択）。 */
  readonly value: string | null;
  /** 子がクリックされたときに group を通じて onChange を発火する。 */
  notifyChange(value: string, e: MouseEvent): void;
  /** small モード。 */
  readonly small: boolean;
}

/** {@link createToggleButton} のオプション。ui/ToggleButton.tsx の ToggleButtonProps 相当。 */
export interface CreateToggleButtonOptions {
  /** このボタンの識別値。Group の value と一致したとき選択状態になる。 */
  readonly value: string;
  /** ボタン内のコンテンツ。 */
  readonly children?: VanillaContent;
  /** 単体利用時の選択状態を直接制御する（Group 登録時は Group 側が優先）。 */
  readonly selected?: boolean;
  /** 無効状態。 */
  readonly disabled?: boolean;
  /** root への追加スタイル。 */
  readonly style?: Partial<CSSStyleDeclaration>;
  /** root への追加クラス。 */
  readonly className?: string;
  /** aria-label。 */
  readonly ariaLabel?: string;
  /** mousedown ハンドラ。 */
  readonly onMouseDown?: (e: MouseEvent) => void;
  /** mouseup ハンドラ。 */
  readonly onMouseUp?: (e: MouseEvent) => void;
  /** mouseleave ハンドラ。 */
  readonly onMouseLeave?: (e: MouseEvent) => void;
}

/** {@link createToggleButton} の戻り値。 */
export interface ToggleButtonHandle {
  readonly el: HTMLButtonElement;
  /** このボタンの value（Group が参照する）。 */
  readonly value: string;
  /**
   * Group が登録時に呼ぶ。group ハンドルを束ねて選択状態を再評価する。
   * null を渡すと Group から切り離す。
   */
  attachGroup(group: ToggleGroupControlHandle | null): void;
  /** group.notify() からの再評価要求。 */
  syncFromGroup(): void;
  /** event listener を解除する。 */
  destroy(): void;
}

/**
 * MUI ToggleButton の vanilla 置換（graph-viewer 専用）。
 */
export function createToggleButton(opts: CreateToggleButtonOptions): ToggleButtonHandle {
  injectGraphUiStyles();

  const { value } = opts;
  let group: ToggleGroupControlHandle | null = null;
  let standaloneSelected = opts.selected ?? false;

  const computeSelected = (): boolean => {
    if (group != null) {
      return group.value === value;
    }
    return standaloneSelected;
  };

  const applyState = (): void => {
    const isSelected = computeSelected();
    const isSmall = group?.small ?? false;
    const classes = [
      'gv-toggle-btn',
      isSmall ? 'gv-toggle-btn--small' : '',
      opts.className,
    ]
      .filter(Boolean)
      .join(' ');
    el.className = classes;
    el.setAttribute('aria-pressed', String(isSelected));
  };

  const el = document.createElement('button');
  el.type = 'button';
  if (opts.disabled) el.disabled = true;
  if (opts.ariaLabel != null) el.setAttribute('aria-label', opts.ariaLabel);
  if (opts.style) {
    for (const [k, v] of Object.entries(opts.style)) {
      if (v != null) (el.style as unknown as Record<string, string>)[k] = String(v);
    }
  }
  appendContent(el, opts.children);
  applyState();

  const onClick = (e: MouseEvent): void => {
    group?.notifyChange(value, e);
  };
  el.addEventListener('click', onClick);

  if (opts.onMouseDown) el.addEventListener('mousedown', opts.onMouseDown);
  if (opts.onMouseUp) el.addEventListener('mouseup', opts.onMouseUp);
  if (opts.onMouseLeave) el.addEventListener('mouseleave', opts.onMouseLeave);

  return {
    el,
    value,
    attachGroup(g: ToggleGroupControlHandle | null): void {
      group = g;
      applyState();
    },
    syncFromGroup(): void {
      applyState();
    },
    destroy(): void {
      el.removeEventListener('click', onClick);
      if (opts.onMouseDown) el.removeEventListener('mousedown', opts.onMouseDown);
      if (opts.onMouseUp) el.removeEventListener('mouseup', opts.onMouseUp);
      if (opts.onMouseLeave) el.removeEventListener('mouseleave', opts.onMouseLeave);
      group = null;
    },
  };
}

// --- ToggleButtonGroup -------------------------------------------------------

/** {@link createToggleButtonGroup} のオプション。ui/ToggleButtonGroup.tsx の ToggleButtonGroupProps 相当。 */
export interface CreateToggleButtonGroupOptions {
  /** 排他選択（MUI 互換のため受けるが本実装では常に単一値）。 */
  readonly exclusive?: boolean;
  /** 選択中の value（null は未選択）。 */
  readonly value?: string | null;
  /** small モード（gv-toggle-btn--small を子に付与）。 */
  readonly size?: 'small' | 'medium';
  /** 幅 100%（gv-toggle-group--full を付与）。 */
  readonly fullWidth?: boolean;
  /** 無効状態（全子に disabled を付与）。 */
  readonly disabled?: boolean;
  /** 値変更コールバック（子クリック時）。 */
  readonly onChange: (e: MouseEvent, value: string | null) => void;
  /** root への追加スタイル。 */
  readonly style?: Partial<CSSStyleDeclaration>;
  /** root への追加クラス。 */
  readonly className?: string;
}

/** {@link createToggleButtonGroup} の戻り値。 */
export interface ToggleButtonGroupHandle {
  /** div[role=group] 要素。 */
  readonly el: HTMLDivElement;
  /**
   * 子 ToggleButton を登録し DOM へ append する。
   * 登録後に選択状態を再評価する。
   */
  register(child: ToggleButtonHandle): void;
  /** 選択値を変更し全子の selected を更新する。 */
  setValue(value: string | null): void;
  /** event listener を解除し子を detach する。 */
  destroy(): void;
}

/**
 * MUI ToggleButtonGroup の vanilla 置換（graph-viewer 専用）。
 *
 * 子は register(child) で登録する。クリック時に onChange を発火し全子を再評価する。
 */
export function createToggleButtonGroup(
  opts: CreateToggleButtonGroupOptions,
): ToggleButtonGroupHandle {
  injectGraphUiStyles();

  let currentValue: string | null = opts.value ?? null;
  let changeHandler = opts.onChange;
  const children: ToggleButtonHandle[] = [];

  const classes = [
    'gv-toggle-group',
    opts.fullWidth ? 'gv-toggle-group--full' : '',
    opts.className,
  ]
    .filter(Boolean)
    .join(' ');

  const el = document.createElement('div');
  el.className = classes;
  el.setAttribute('role', 'group');
  if (opts.style) {
    for (const [k, v] of Object.entries(opts.style)) {
      if (v != null) (el.style as unknown as Record<string, string>)[k] = String(v);
    }
  }

  // Group ハンドル（子へ渡す。getter で最新値を返す）。
  const handle: ToggleGroupControlHandle = {
    get value() {
      return currentValue;
    },
    get small() {
      return opts.size === 'small';
    },
    notifyChange(value: string, e: MouseEvent) {
      currentValue = value;
      syncChildren();
      changeHandler(e, value);
    },
  };

  const syncChildren = (): void => {
    for (const child of children) child.syncFromGroup();
  };

  return {
    el,
    register(child: ToggleButtonHandle): void {
      children.push(child);
      if (opts.disabled) child.el.disabled = true;
      child.attachGroup(handle);
      el.appendChild(child.el);
    },
    setValue(value: string | null): void {
      currentValue = value;
      syncChildren();
    },
    destroy(): void {
      for (const child of children) {
        child.attachGroup(null);
        child.destroy();
      }
      children.length = 0;
      changeHandler = () => undefined;
    },
  };
}
