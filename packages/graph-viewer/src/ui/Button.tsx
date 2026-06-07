import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { injectGraphUiStyles } from './injectStyles';

type Variant = 'text' | 'outlined' | 'contained';
type Size = 'small' | 'medium';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly startIcon?: ReactNode;
}

/** MUI Button の置換。text / outlined / contained。 */
export function Button({
  variant = 'text',
  size = 'medium',
  startIcon,
  className,
  children,
  type = 'button',
  ...rest
}: Readonly<ButtonProps>) {
  injectGraphUiStyles();
  const classes = [
    'gv-btn',
    `gv-btn--${variant}`,
    size === 'small' ? 'gv-btn--small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {startIcon}
      {children}
    </button>
  );
}
