import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface FormControlLabelProps {
  /** 制御要素（Switch / Checkbox 等）。 */
  readonly control: ReactElement;
  readonly label: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/**
 * MUI FormControlLabel の置換（単体 control 用。RadioGroup 連携はしない）。
 * control とラベルを横並びにする。
 */
export function FormControlLabel({ control, label, style, className }: Readonly<FormControlLabelProps>) {
  injectGraphUiStyles();
  const classes = ['gv-form-control-label', className].filter(Boolean).join(' ');
  return (
    <label className={classes} style={style}>
      {control}
      {label}
    </label>
  );
}
