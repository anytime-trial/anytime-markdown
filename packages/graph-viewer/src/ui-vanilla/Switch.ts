import { injectGraphUiStyles } from '../ui/injectStyles';

export interface SwitchOptions {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}

/**
 * MUI Switch の vanilla 置換（native checkbox + トラック/サム描画）。
 * onChange は React SyntheticEvent を持たないシンプルなコールバック形式にする。
 * checked の初期値は opts.checked で設定される。その後の checked 状態は
 * DOM input 要素（handle.input）で直接参照・更新できる。
 */
export interface SwitchHandle {
  /** スイッチ全体の wrapper span 要素。DOM に挿入して使う。 */
  readonly el: HTMLSpanElement;
  /** input[type="checkbox"] への参照。checked プロパティで現在値を読み書きできる。 */
  readonly input: HTMLInputElement;
}

export function createSwitch(opts: SwitchOptions): SwitchHandle {
  injectGraphUiStyles();

  const { checked, onChange, disabled = false, ariaLabel } = opts;

  const wrapper = document.createElement('span');
  wrapper.className = 'gv-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.disabled = disabled;
  if (ariaLabel) input.setAttribute('aria-label', ariaLabel);

  input.addEventListener('change', () => {
    onChange(input.checked);
  });

  const track = document.createElement('span');
  track.className = 'gv-switch__track';

  const thumb = document.createElement('span');
  thumb.className = 'gv-switch__thumb';

  wrapper.appendChild(input);
  wrapper.appendChild(track);
  wrapper.appendChild(thumb);

  return { el: wrapper, input };
}
