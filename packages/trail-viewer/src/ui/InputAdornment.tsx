import type { CSSProperties, ReactNode } from "react";

import { injectTrailUiStyles } from "./injectStyles";

export interface InputAdornmentProps {
  readonly position?: "start" | "end";
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI InputAdornment の置換。TextField の前後に付けるアドーンメント。 */
export function InputAdornment({
  position: _position,
  children,
  style,
  className,
}: Readonly<InputAdornmentProps>) {
  injectTrailUiStyles();
  const classes = ["trv-input-adornment", className].filter(Boolean).join(" ");
  return (
    <span className={classes} style={style}>
      {children}
    </span>
  );
}
