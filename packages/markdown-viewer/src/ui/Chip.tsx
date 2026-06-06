import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";

import styles from "./Chip.module.css";

export interface ChipProps {
  label: ReactNode;
  size?: "small" | "medium";
  variant?: "outlined" | "filled";
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  className?: string;
  style?: CSSProperties;
}

/** MUI Chip の置換。outlined / filled × small / medium。onClick 指定でボタン化。 */
export function Chip({
  label,
  size = "medium",
  variant = "filled",
  onClick,
  className,
  style,
}: Readonly<ChipProps>) {
  const clickable = !!onClick;
  const classes = [
    styles.chip,
    styles[size],
    styles[variant],
    clickable ? styles.clickable : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const handleKeyDown = clickable
    ? (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }
    : undefined;
  return (
    <div
      className={classes}
      style={style}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <span className={styles.label}>{label}</span>
    </div>
  );
}
