import type { ReactNode } from "react";

export interface CollapseProps {
  readonly in: boolean;
  /** 閉じた際に子をアンマウントする（MUI unmountOnExit 相当）。 */
  readonly unmountOnExit?: boolean;
  readonly children?: ReactNode;
}

/**
 * MUI Collapse の最小置換。閉じた際は `display:none`（状態保持）、
 * unmountOnExit 指定時は children をアンマウントする。
 */
export function Collapse({ in: open, unmountOnExit, children }: Readonly<CollapseProps>) {
  if (!open && unmountOnExit) return null;
  return <div style={{ display: open ? undefined : "none" }}>{children}</div>;
}
