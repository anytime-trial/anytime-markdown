import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import styles from "./Chip.module.css";

export interface ChipProps {
  label: ReactNode;
  size?: "small" | "medium";
  variant?: "outlined" | "filled";
  onClick?: () => void;
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
          onClick?.();
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
