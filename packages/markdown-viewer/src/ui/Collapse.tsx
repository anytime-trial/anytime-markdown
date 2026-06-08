import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";

import styles from "./Collapse.module.css";
import { useTransitionMount } from "./useTransitionMount";

export interface CollapseProps {
  /** 展開状態。 */
  in: boolean;
  /** 遷移時間(ms)。既定 150。 */
  timeout?: number;
  /** 閉じた後に子をアンマウントする。 */
  unmountOnExit?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * MUI Collapse の置換。grid-template-rows のアニメーションで高さ計測なしに展開/収縮する。
 * unmountOnExit のときは収縮完了後に子をアンマウントする。
 */
export function Collapse({
  in: inProp,
  timeout = 150,
  unmountOnExit = false,
  children,
  className,
}: Readonly<CollapseProps>) {
  const { mounted, visible } = useTransitionMount(inProp, timeout, unmountOnExit);
  const style = useMemo<CSSProperties>(
    () => ({ ["--collapse-duration" as string]: `${timeout}ms` }),
    [timeout],
  );

  if (unmountOnExit && !mounted) return null;

  const rootClass = [styles.root, visible && styles.open, className].filter(Boolean).join(" ");

  return (
    <div className={rootClass} style={style}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
