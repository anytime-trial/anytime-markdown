import type {
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

import { injectGraphUiStyles } from './injectStyles';

type CommonChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> {
  readonly value: string | number;
  readonly onChange: CommonChange;
  readonly size?: 'small' | 'medium';
  /** MUI 互換: 幅 100%。 */
  readonly fullWidth?: boolean;
  /** MUI 互換: native `<select>` として描画する。 */
  readonly select?: boolean;
  /** MUI 互換（native select 想定）。本実装では常に native のため無視する。 */
  readonly SelectProps?: { readonly native?: boolean };
  /** select モードの `<option>` 子要素。 */
  readonly children?: ReactNode;
  /** MUI 互換: htmlInput 属性（min/max 等）。 */
  readonly slotProps?: { readonly htmlInput?: InputHTMLAttributes<HTMLInputElement> };
  readonly style?: CSSProperties;
}

/** MUI TextField の置換（単一行 input / native select）。 */
export function TextField({
  value,
  onChange,
  size,
  fullWidth,
  select,
  SelectProps: _SelectProps,
  children,
  slotProps,
  disabled,
  style,
  className,
  ...rest
}: Readonly<TextFieldProps>) {
  injectGraphUiStyles();
  const composed: CSSProperties = { width: fullWidth ? '100%' : undefined, ...style };

  if (select) {
    const selectClasses = ['gv-textfield', 'gv-select', className].filter(Boolean).join(' ');
    return (
      <select
        className={selectClasses}
        value={value}
        disabled={disabled}
        onChange={onChange}
        style={composed}
        {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {children}
      </select>
    );
  }

  const classes = ['gv-textfield', className].filter(Boolean).join(' ');
  return (
    <input
      className={classes}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={composed}
      {...slotProps?.htmlInput}
      {...rest}
    />
  );
}
