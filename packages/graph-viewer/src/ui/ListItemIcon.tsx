import type { ReactNode } from 'react';

/** MUI ListItemIcon の置換（メニュー項目の先頭アイコン枠）。 */
export function ListItemIcon({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="gv-list-item-icon">{children}</span>;
}
