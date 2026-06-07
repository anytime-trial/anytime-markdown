import type { CSSProperties, ReactNode } from "react";

/** MUI ListItemIcon の置換（行頭アイコン枠）。 */
export function ListItemIcon({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: CSSProperties }>) {
  return (
    <span className="dbv-list-item-icon" style={style}>
      {children}
    </span>
  );
}
