import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  readonly direction?: 'row' | 'column';
  /** MUI spacing 互換。1 単位 = 8px の gap。 */
  readonly spacing?: number;
  readonly alignItems?: CSSProperties['alignItems'];
  readonly justifyContent?: CSSProperties['justifyContent'];
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** MUI Stack の最小置換。flex コンテナ。 */
export function Stack({
  direction = 'column',
  spacing = 0,
  alignItems,
  justifyContent,
  style,
  className,
  children,
  ...rest
}: Readonly<StackProps>) {
  injectGraphUiStyles();
  const composed: CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap: spacing ? `${spacing * 8}px` : undefined,
    alignItems,
    justifyContent,
    ...style,
  };
  return (
    <div className={className} style={composed} {...rest}>
      {children}
    </div>
  );
}
