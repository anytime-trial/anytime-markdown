import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Children, cloneElement, isValidElement } from "react";

import { injectDatabaseUiStyles } from "./injectStyles";
import type { TabProps } from "./Tab";

export interface TabsProps {
  /** 選択中の Tab value。未選択は false。 */
  readonly value: string | false;
  readonly onChange: (value: string) => void;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}

/** MUI Tabs の置換。子の Tab に selected / onSelect を注入する。 */
export function Tabs({ value, onChange, style, children }: Readonly<TabsProps>) {
  injectDatabaseUiStyles();
  return (
    <div className="dbv-tabs" role="tablist" style={style}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<TabProps>;
        return cloneElement(el, {
          selected: value !== false && el.props.value === value,
          onSelect: onChange,
        });
      })}
    </div>
  );
}
