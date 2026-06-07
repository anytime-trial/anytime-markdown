import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface ListItemButtonProps {
  readonly children?: ReactNode;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly onContextMenu?: (e: MouseEvent<HTMLLIElement>) => void;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI ListItemButton の置換（クリック可能なリスト行）。`<li role="button">` で構成。 */
export function ListItemButton({
  children,
  selected,
  onClick,
  onContextMenu,
  style,
  className,
}: Readonly<ListItemButtonProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-list-item-button", selected ? "dbv-selected" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      role="button"
      tabIndex={0}
      aria-selected={selected}
      className={classes}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
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
