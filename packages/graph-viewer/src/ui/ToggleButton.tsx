import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

import { injectGraphUiStyles } from './injectStyles';

interface ToggleInjectedProps {
  readonly _selected?: boolean;
  readonly _onToggle?: (e: MouseEvent, value: string) => void;
  readonly _disabled?: boolean;
  readonly _small?: boolean;
}

export interface ToggleButtonProps extends ToggleInjectedProps {
  readonly value: string;
  readonly children: ReactNode;
  /** 明示的な選択状態。グループの値一致による自動判定を上書きする。 */
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly onMouseDown?: (e: MouseEvent<HTMLElement>) => void;
  readonly onMouseUp?: (e: MouseEvent<HTMLElement>) => void;
  readonly onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
}

/** MUI ToggleButton の置換。 */
export function ToggleButton({
  value,
  children,
  selected,
  disabled,
  style,
  className,
  _selected,
  _onToggle,
  _disabled,
  _small,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  ...rest
}: Readonly<ToggleButtonProps>) {
  injectGraphUiStyles();
  const isSelected = selected ?? _selected ?? false;
  const classes = ['gv-toggle-btn', _small ? 'gv-toggle-btn--small' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      aria-pressed={isSelected}
      disabled={disabled ?? _disabled}
      style={style}
      onClick={(e) => _onToggle?.(e, value)}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface ToggleButtonGroupProps {
  /** 排他選択（MUI 互換のため受けるが本実装では常に単一値）。 */
  readonly exclusive?: boolean;
  readonly value?: string | null;
  readonly size?: 'small' | 'medium';
  readonly fullWidth?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (e: MouseEvent, value: string | null) => void;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI ToggleButtonGroup の置換。子 ToggleButton に選択状態とハンドラを注入する。 */
export function ToggleButtonGroup({
  value,
  size,
  fullWidth,
  disabled,
  onChange,
  children,
  style,
  className,
}: Readonly<ToggleButtonGroupProps>) {
  injectGraphUiStyles();
  const items = Array.isArray(children) ? children : [children];
  const classes = ['gv-toggle-group', fullWidth ? 'gv-toggle-group--full' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} role="group" style={style}>
      {items.map((child, i) => {
        if (!isValidElement(child)) return child;
        const childProps = child.props as ToggleButtonProps;
        return cloneElement(child as ReactElement<ToggleButtonProps>, {
          key: i,
          _selected: value != null && childProps.value === value,
          _onToggle: onChange,
          _disabled: disabled,
          _small: size === 'small',
        });
      })}
    </div>
  );
}
