import type { CSSProperties, ReactNode } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface ChipProps {
  readonly label: ReactNode;
  readonly size?: 'small' | 'medium';
  readonly onDelete?: () => void;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** MUI Chip の置換（ラベル + 任意の削除ボタン）。 */
export function Chip({ label, size, onDelete, style, className }: Readonly<ChipProps>) {
  injectGraphUiStyles();
  const classes = ['gv-chip', size === 'small' ? 'gv-chip--small' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} style={style}>
      {label}
      {onDelete && (
        <button type="button" className="gv-chip__delete" aria-label="Delete" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z" />
          </svg>
        </button>
      )}
    </span>
  );
}
