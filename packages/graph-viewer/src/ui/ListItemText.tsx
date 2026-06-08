import type { ReactNode } from 'react';

/** MUI ListItemText の置換（メニュー項目のラベル）。 */
export function ListItemText({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="gv-list-item-text">{children}</span>;
}
