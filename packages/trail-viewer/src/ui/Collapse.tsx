import type { CSSProperties, ReactNode } from "react";

import { sxToStyle } from "./sx";

export interface CollapseProps {
  readonly in: boolean;
  /** 閉じた際に子をアンマウントする（MUI unmountOnExit 相当）。 */
  readonly unmountOnExit?: boolean;
  readonly timeout?: number | "auto";
  readonly children?: ReactNode;
  readonly sx?: Record<string, unknown>;
  readonly style?: CSSProperties;
}

/**
 * MUI Collapse の最小置換。閉じた際は `display:none`（状態保持）、
 * unmountOnExit 指定時は children をアンマウントする。
 */
export function Collapse({ in: open, unmountOnExit, timeout: _timeout, children, sx, style }: Readonly<CollapseProps>) {
  if (!open && unmountOnExit) return null;
  return (
    <div
      style={{ ...sxToStyle(sx), display: open ? undefined : "none", ...style }}
    >
      {children}
    </div>
  );
}
