import type { CSSProperties } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface DividerProps {
  readonly orientation?: 'horizontal' | 'vertical';
  /** MUI 互換: flex コンテナ内で交差軸方向へ伸ばす（vertical 時に有効）。 */
  readonly flexItem?: boolean;
  readonly style?: CSSProperties;
}

/** MUI Divider の置換（区切り線）。横（既定）／縦の両対応。 */
export function Divider({ orientation = 'horizontal', style }: Readonly<DividerProps>) {
  injectGraphUiStyles();
  const className = orientation === 'vertical' ? 'gv-divider gv-divider--vertical' : 'gv-divider';
  return <hr className={className} style={style} />;
}
