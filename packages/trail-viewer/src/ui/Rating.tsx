import type { CSSProperties, SyntheticEvent } from "react";
import { useState } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import { sxToStyle } from "./sx";

export interface RatingProps {
  readonly value: number | null;
  readonly onChange?: (e: SyntheticEvent, value: number | null) => void;
  readonly max?: number;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  readonly size?: "small" | "medium" | "large";
  readonly precision?: number;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly sx?: Record<string, unknown>;
}

/** MUI Rating の置換。星評価コンポーネント。 */
export function Rating({
  value,
  onChange,
  max = 5,
  readOnly,
  disabled,
  size,
  precision: _precision,
  style,
  className,
  sx,
}: Readonly<RatingProps>) {
  injectTrailUiStyles();
  const [hover, setHover] = useState(-1);

  const classes = [
    "trv-rating",
    readOnly ? "trv-rating--readonly" : "",
    size === "small" ? "trv-rating--small" : "",
    size === "large" ? "trv-rating--large" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const displayValue = hover > 0 ? hover : (value ?? 0);

  return (
    <span className={classes} style={{ ...sxToStyle(sx), ...style }} aria-label={`${value ?? 0} stars`}>
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const filled = starValue <= displayValue;
        return (
          <button
            key={starValue}
            type="button"
            className="trv-rating-btn"
            disabled={disabled || readOnly}
            aria-label={`${starValue} star${starValue !== 1 ? "s" : ""}`}
            onMouseEnter={() => !readOnly && !disabled && setHover(starValue)}
            onMouseLeave={() => !readOnly && !disabled && setHover(-1)}
            onClick={(e) => {
              if (!readOnly && !disabled) {
                onChange?.(e, starValue === value ? null : starValue);
              }
            }}
          >
            {filled ? "★" : "☆"}
          </button>
        );
      })}
    </span>
  );
}
