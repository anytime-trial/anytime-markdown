import type { ChangeEvent, CSSProperties, SyntheticEvent } from 'react';

import { injectGraphUiStyles } from './injectStyles';

export interface SliderProps {
  readonly value: number | number[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (event: SyntheticEvent, value: number | number[]) => void;
  readonly size?: 'small' | 'medium';
  readonly disabled?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

/**
 * MUI Slider の置換。単一値（number）と範囲（number[]、dual-thumb）の両対応。
 * 単一値は native `<input type="range">`、範囲は 2 つの range input を重ねて表現する。
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  size,
  disabled,
  style,
  className,
  ...rest
}: Readonly<SliderProps>) {
  injectGraphUiStyles();
  const ariaLabel = rest['aria-label'];

  if (Array.isArray(value)) {
    const [lo, hi] = value;
    const span = max - min || 1;
    const fillLeft = ((lo - min) / span) * 100;
    const fillRight = ((hi - min) / span) * 100;
    const handleLo = (e: ChangeEvent<HTMLInputElement>): void => {
      const next = Math.min(Number(e.target.value), hi);
      onChange(e, [next, hi]);
    };
    const handleHi = (e: ChangeEvent<HTMLInputElement>): void => {
      const next = Math.max(Number(e.target.value), lo);
      onChange(e, [lo, next]);
    };
    return (
      <div className={['gv-slider-range', className].filter(Boolean).join(' ')} style={style}>
        <div className="gv-slider-range__track" />
        <div
          className="gv-slider-range__fill"
          style={{ left: `${fillLeft}%`, width: `${fillRight - fillLeft}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          disabled={disabled}
          onChange={handleLo}
          aria-label={ariaLabel ? `${ariaLabel} min` : 'minimum'}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          disabled={disabled}
          onChange={handleHi}
          aria-label={ariaLabel ? `${ariaLabel} max` : 'maximum'}
        />
      </div>
    );
  }

  const classes = ['gv-slider', size === 'small' ? 'gv-slider--small' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <input
      type="range"
      className={classes}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      style={style}
      onChange={(e) => onChange(e, Number(e.target.value))}
      aria-label={ariaLabel}
    />
  );
}
