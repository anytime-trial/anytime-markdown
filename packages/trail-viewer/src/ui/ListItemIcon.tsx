import type { CSSProperties, ReactNode } from "react";

import { sxToStyle } from "./sx";

export interface ListItemIconProps {
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly sx?: Record<string, unknown>;
}

/** MUI ListItemIcon の置換（行頭アイコン枠）。 */
export function ListItemIcon({
  children,
  style,
  sx,
}: Readonly<ListItemIconProps>) {
  return (
    <span className="trv-list-item-icon" style={{ ...sxToStyle(sx), ...style }}>
      {children}
    </span>
  );
}
