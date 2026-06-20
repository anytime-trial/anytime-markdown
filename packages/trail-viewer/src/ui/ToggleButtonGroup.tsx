import type { CSSProperties, ReactElement, ReactNode, SyntheticEvent } from "react";
import { Children, cloneElement, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { ToggleButtonProps } from "./ToggleButton";
import { sxToStyle } from "./sx";

export interface ToggleButtonGroupProps {
  readonly value?: string | string[] | null;
  // accepted for MUI compatibility; consumers may pass a narrower value type
  readonly onChange?: (e: SyntheticEvent, value: unknown) => void;
  readonly exclusive?: boolean;
  readonly children?: ReactNode;
  readonly size?: "small" | "medium" | "large";
  readonly orientation?: "horizontal" | "vertical";
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI ToggleButtonGroup の置換。exclusive / multiple 選択対応。 */
export function ToggleButtonGroup({
  value,
  onChange,
  exclusive = false,
  children,
  size,
  orientation: _orientation,
  style,
  className,
  sx,
}: Readonly<ToggleButtonGroupProps>) {
  injectTrailUiStyles();
  const classes = ["trv-toggle-group", className].filter(Boolean).join(" ");

  const handleChange = (e: SyntheticEvent, btnValue: string): void => {
    if (!onChange) return;
    if (exclusive) {
      onChange(e, btnValue === value ? null : btnValue);
    } else {
      const current = Array.isArray(value) ? value : [];
      const next = current.includes(btnValue)
        ? current.filter((v) => v !== btnValue)
        : [...current, btnValue];
      onChange(e, next.length > 0 ? next : null);
    }
  };

  const isSelected = (btnValue: string): boolean => {
    if (exclusive) return value === btnValue;
    return Array.isArray(value) ? value.includes(btnValue) : false;
  };

  return (
    <div className={classes} role="group" style={{ ...sxToStyle(sx), ...style }}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<ToggleButtonProps>;
        return cloneElement(el, {
          selected: isSelected(el.props.value),
          onChange: handleChange,
          size: size ?? el.props.size,
        });
      })}
    </div>
  );
}
