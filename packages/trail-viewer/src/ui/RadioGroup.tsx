import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { Children, cloneElement, isValidElement } from "react";

import { injectTrailUiStyles } from "./injectStyles";
import type { RadioProps } from "./Radio";

export interface RadioGroupProps {
  readonly name?: string;
  readonly value?: string;
  readonly onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly children?: ReactNode;
  readonly row?: boolean;
}

/** MUI RadioGroup の置換。子の Radio に checked/name を注入する。 */
export function RadioGroup({
  name,
  value,
  onChange,
  children,
  row,
}: Readonly<RadioGroupProps>) {
  injectTrailUiStyles();
  return (
    <div
      role="radiogroup"
      style={{ display: "flex", flexDirection: row ? "row" : "column", gap: "8px" }}
    >
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<RadioProps>;
        const radioValue = el.props.value ?? "";
        return cloneElement(el, {
          name,
          checked: value !== undefined ? value === radioValue : el.props.checked,
          onChange,
        });
      })}
    </div>
  );
}
