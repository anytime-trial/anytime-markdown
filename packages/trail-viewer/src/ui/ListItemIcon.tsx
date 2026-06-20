import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

import { sxToStyle } from "./sx";

export interface ListItemIconProps {
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly sx?: Record<string, unknown>;
  readonly onClick?: MouseEventHandler<HTMLSpanElement>;
}

/** MUI ListItemIcon の置換（行頭アイコン枠）。 */
export function ListItemIcon({
  children,
  style,
  sx,
  onClick,
}: Readonly<ListItemIconProps>) {
  return (
    <span className="trv-list-item-icon" style={{ ...sxToStyle(sx), ...style }} onClick={onClick}>
      {children}
    </span>
  );
}
