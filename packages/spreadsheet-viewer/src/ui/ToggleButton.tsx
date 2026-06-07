import type { MouseEvent, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";

import { injectSpreadsheetUiStyles } from "./injectStyles";

interface ToggleInjectedProps {
  readonly _selected?: boolean;
  readonly _onToggle?: (e: MouseEvent, value: string) => void;
  readonly _disabled?: boolean;
}

export interface ToggleButtonProps extends ToggleInjectedProps {
  readonly value: string;
  readonly children: ReactNode;
  readonly "aria-label"?: string;
}

/** MUI ToggleButton の置換。 */
export function ToggleButton({
  value,
  children,
  _selected,
  _onToggle,
  _disabled,
  ...rest
}: Readonly<ToggleButtonProps>) {
  injectSpreadsheetUiStyles();
  return (
    <button
      type="button"
      className="sv-toggle-btn"
      aria-pressed={_selected ?? false}
      disabled={_disabled}
      onClick={(e) => _onToggle?.(e, value)}
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
  readonly size?: "small" | "medium";
  readonly disabled?: boolean;
  readonly onChange: (e: MouseEvent, value: string | null) => void;
  readonly children: ReactNode;
}

/** MUI ToggleButtonGroup の置換。子 ToggleButton に選択状態とハンドラを注入する。 */
export function ToggleButtonGroup({
  value,
  disabled,
  onChange,
  children,
}: Readonly<ToggleButtonGroupProps>) {
  injectSpreadsheetUiStyles();
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="sv-toggle-group" role="group">
      {items.map((child, i) =>
        isValidElement(child)
          ? cloneElement(child as ReactElement<ToggleButtonProps>, {
              key: i,
              _selected: value != null && (child.props as ToggleButtonProps).value === value,
              _onToggle: onChange,
              _disabled: disabled,
            })
          : child,
      )}
    </div>
  );
}
