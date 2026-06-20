import type { CSSProperties, ReactNode } from "react";

export interface ListItemTextProps {
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  /** ラベルへ追加適用するスタイル（MUI slotProps.primary 相当）。 */
  readonly primaryStyle?: CSSProperties;
}

/** MUI ListItemText の置換（行のラベル）。 */
export function ListItemText({ primary, secondary, primaryStyle }: Readonly<ListItemTextProps>) {
  return (
    <span className="trv-list-item-text">
      <span
        style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...primaryStyle,
        }}
      >
        {primary}
      </span>
      {secondary && (
        <span
          style={{
            display: "block",
            fontSize: "0.75rem",
            color: "var(--trv-color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {secondary}
        </span>
      )}
    </span>
  );
}
