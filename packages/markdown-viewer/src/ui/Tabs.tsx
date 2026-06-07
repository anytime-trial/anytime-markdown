import { createContext, useMemo } from "react";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";

import styles from "./Tabs.module.css";

export interface TabsContextValue {
  value: string;
  onChange?: (event: MouseEvent<HTMLButtonElement>, value: string) => void;
}

export const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 現在選択中のタブ value。子 Tab の selected を value 一致で決定する。 */
  value: string;
  /** タブ切替時に発火。第 2 引数は選択された Tab の value（MUI Tabs onChange 互換）。 */
  onChange?: (event: MouseEvent<HTMLButtonElement>, value: string) => void;
  children?: ReactNode;
}

/**
 * MUI Tabs の置換。role="tablist" の横並びコンテナ。選択状態は context で配り、各 Tab が
 * 自前の下線インジケータを描く（MUI のスライドインジケータは持たず静止表示）。
 */
export function Tabs({ value, onChange, className, children, ...rest }: Readonly<TabsProps>) {
  const ctx = useMemo<TabsContextValue>(() => ({ value, onChange }), [value, onChange]);
  const classes = [styles.tabs, className].filter(Boolean).join(" ");
  return (
    <TabsContext.Provider value={ctx}>
      <div role="tablist" className={classes} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}
