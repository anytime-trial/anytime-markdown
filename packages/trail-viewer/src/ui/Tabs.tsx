import type { CSSProperties, ReactElement, ReactNode, SyntheticEvent } from "react";
import { Children, cloneElement, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { TabProps } from "./Tab";
import { sxToStyle } from "./sx";

export interface TabsProps<V = string | number> {
  /** 選択中の Tab value。未選択は false。 */
  readonly value: V | false;
  /** MUI 互換: (event, value) => void シグネチャ。 */
  readonly onChange: (event: SyntheticEvent, value: V) => void;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly sx?: Record<string, unknown>;
  /** MUI 互換: accept-and-ignore */
  readonly variant?: string;
}

/** MUI Tabs の置換。子の Tab に selected / onSelect を注入する。 */
export function Tabs<V = string | number>({ value, onChange, style, className, children, sx, variant: _variant }: Readonly<TabsProps<V>>) {
  injectTrailUiStyles();
  const classes = ["trv-tabs", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="tablist" style={{ ...sxToStyle(sx), ...style }}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<TabProps>;
        return cloneElement(el, {
          selected: value !== false && (el.props.value as unknown) === (value as unknown),
          onSelect: (v: string | number, e: SyntheticEvent) => onChange(e, v as unknown as V),
        });
      })}
    </div>
  );
}
