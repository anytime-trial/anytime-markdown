import type { CSSProperties, ReactNode } from "react";

import { sxToStyle } from "./sx";

export interface ListItemTextProps {
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  /** ラベルへ追加適用するスタイル（MUI slotProps.primary 相当）。 */
  readonly primaryStyle?: CSSProperties;
  /** MUI 互換: 受け取るが視覚的には未配線。 */
  readonly primaryTypographyProps?: Record<string, unknown>;
  /** MUI 互換: 受け取るが視覚的には未配線。 */
  readonly secondaryTypographyProps?: Record<string, unknown>;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/** MUI ListItemText の置換（行のラベル）。 */
export function ListItemText({
  primary,
  secondary,
  primaryStyle,
  primaryTypographyProps: _primaryTypographyProps, // accepted for MUI compatibility; not visually wired
  secondaryTypographyProps: _secondaryTypographyProps, // accepted for MUI compatibility; not visually wired
  sx,
  style,
}: Readonly<ListItemTextProps>) {
  return (
    <span className="trv-list-item-text" style={{ ...sxToStyle(sx), ...style }}>
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
