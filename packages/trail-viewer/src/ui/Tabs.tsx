import type { CSSProperties, ReactElement, ReactNode, SyntheticEvent } from "react";
import { Children, cloneElement, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { TabProps } from "./Tab";

export interface TabsProps {
  /** 選択中の Tab value。未選択は false。 */
  readonly value: string | false;
  /** MUI 互換: (event, value) => void シグネチャ。 */
  readonly onChange: (event: SyntheticEvent, value: string) => void;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** MUI Tabs の置換。子の Tab に selected / onSelect を注入する。 */
export function Tabs({ value, onChange, style, className, children }: Readonly<TabsProps>) {
  injectTrailUiStyles();
  const classes = ["trv-tabs", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="tablist" style={style}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<TabProps>;
        return cloneElement(el, {
          selected: value !== false && el.props.value === value,
          onSelect: (v: string, e: SyntheticEvent) => onChange(e, v),
        });
      })}
    </div>
  );
}
