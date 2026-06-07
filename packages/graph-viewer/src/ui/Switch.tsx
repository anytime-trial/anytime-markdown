import type { ChangeEvent, SyntheticEvent } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (event: SyntheticEvent, checked: boolean) => void;
  readonly size?: 'small' | 'medium';
  readonly disabled?: boolean;
  readonly 'aria-label'?: string;
}

/** MUI Switch の置換（native checkbox + トラック/サム描画）。 */
export function Switch({ checked, onChange, disabled, ...rest }: Readonly<SwitchProps>) {
  injectGraphUiStyles();
  const handle = (e: ChangeEvent<HTMLInputElement>): void => onChange(e, e.target.checked);
  return (
    <span className="gv-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={handle}
        aria-label={rest['aria-label']}
      />
      <span className="gv-switch__track" />
      <span className="gv-switch__thumb" />
    </span>
  );
}
