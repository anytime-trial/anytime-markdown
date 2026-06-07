import type { CSSProperties, ReactNode } from "react";

export interface ListItemTextProps {
  readonly primary: ReactNode;
  /** ラベルへ追加適用するスタイル（MUI slotProps.primary 相当）。 */
  readonly primaryStyle?: CSSProperties;
}

/** MUI ListItemText の置換（行のラベル）。 */
export function ListItemText({ primary, primaryStyle }: Readonly<ListItemTextProps>) {
  return (
    <span
      className="dbv-list-item-text"
      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...primaryStyle }}
    >
      {primary}
    </span>
  );
}
