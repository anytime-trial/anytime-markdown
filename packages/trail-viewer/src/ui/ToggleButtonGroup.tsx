import type { CSSProperties, ReactElement, ReactNode, SyntheticEvent } from "react";
import { Children, cloneElement, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { ToggleButtonProps } from "./ToggleButton";
import { sxToStyle } from "./sx";

export interface ToggleButtonGroupProps<V = unknown> {
  readonly value?: V | null;
  readonly onChange?: (e: SyntheticEvent, value: V | null) => void;
  readonly exclusive?: boolean;
  readonly children?: ReactNode;
  readonly size?: "small" | "medium" | "large";
  readonly orientation?: "horizontal" | "vertical";
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI ToggleButtonGroup の置換。exclusive / multiple 選択対応。 */
export function ToggleButtonGroup<V = unknown>({
  value,
  onChange,
  exclusive = false,
  children,
  size,
  orientation: _orientation,
  style,
  className,
  sx,
}: Readonly<ToggleButtonGroupProps<V>>) {
  injectTrailUiStyles();
  const classes = ["trv-toggle-group", className].filter(Boolean).join(" ");

  const handleChange = (e: SyntheticEvent, btnValue: string): void => {
    if (!onChange) return;
    if (exclusive) {
      const typed = btnValue as unknown as V;
      onChange(e, (typed as unknown) === (value as unknown) ? null : typed);
    } else {
      const current = Array.isArray(value) ? (value as unknown[]) : [];
      const next = current.includes(btnValue as unknown)
        ? current.filter((v) => v !== (btnValue as unknown))
        : [...current, btnValue as unknown];
      onChange(e, (next.length > 0 ? next : null) as unknown as V | null);
    }
  };

  const isSelected = (btnValue: string): boolean => {
    if (exclusive) return (value as unknown) === (btnValue as unknown);
    return Array.isArray(value) ? (value as unknown[]).includes(btnValue as unknown) : false;
  };

  // ToggleButton が Tooltip 等でラップされている場合、直下の子は value を持たない。
  // その場合は 1 段下の子（実 ToggleButton）の value を解決する。
  const resolveValue = (el: ReactElement<ToggleButtonProps>): unknown => {
    if (el.props.value !== undefined) return el.props.value;
    const inner = el.props.children;
    if (isValidElement(inner)) {
      return (inner as ReactElement<ToggleButtonProps>).props.value;
    }
    return undefined;
  };

  return (
    <div className={classes} role="group" style={{ ...sxToStyle(sx), ...style }}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<ToggleButtonProps>;
        return cloneElement(el, {
          selected: isSelected(String(resolveValue(el))),
          onChange: handleChange,
          size: size ?? el.props.size,
        });
      })}
    </div>
  );
}
