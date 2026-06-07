import type { CSSProperties } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface CircularProgressProps {
  /** スピナーの直径（px）。 */
  readonly size?: number;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI CircularProgress の置換（CSS アニメーションの不確定スピナー）。 */
export function CircularProgress({ size = 24, style, className }: Readonly<CircularProgressProps>) {
  injectGraphUiStyles();
  const classes = ['gv-spinner', className].filter(Boolean).join(' ');
  return (
    <span
      className={classes}
      role="progressbar"
      aria-label="loading"
      style={{ width: size, height: size, ...style }}
    />
  );
}
