import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface ListItemButtonProps {
  readonly children?: ReactNode;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly onContextMenu?: (e: MouseEvent<HTMLLIElement>) => void;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly sx?: Record<string, unknown>;
}

/** MUI ListItemButton の置換（クリック可能なリスト行）。`<li role="button">` で構成。 */
export function ListItemButton({
  children,
  selected,
  onClick,
  onContextMenu,
  style,
  className,
  disabled,
  sx,
}: Readonly<ListItemButtonProps>) {
  injectTrailUiStyles();
  const classes = [
    "trv-list-item-button",
    selected ? "trv-selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-selected={selected}
      aria-disabled={disabled}
      className={classes}
      style={{ ...sxToStyle(sx), ...style }}
      onClick={disabled ? undefined : onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {children}
    </li>
  );
}
