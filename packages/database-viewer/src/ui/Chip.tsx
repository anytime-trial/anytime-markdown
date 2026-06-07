import type { ReactNode } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";

export interface ChipProps {
  readonly label: ReactNode;
  readonly size?: "small" | "medium";
}

/** MUI Chip の最小置換（ラベルバッジ）。 */
export function Chip({ label, size = "medium" }: Readonly<ChipProps>) {
  injectDatabaseUiStyles();
  const classes = ["dbv-chip", size === "small" ? "dbv-chip--small" : ""].filter(Boolean).join(" ");
  return <span className={classes}>{label}</span>;
}
