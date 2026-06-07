import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import styles from "./Collapse.module.css";

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
  // open=遷移用の grid 状態。mounted=unmountOnExit 用の DOM 存在状態。
  const [open, setOpen] = useState(inProp);
  const [mounted, setMounted] = useState(inProp);

  useEffect(() => {
    if (inProp) {
      setMounted(true);
      // mount 直後の同一フレームで 1fr にすると遷移しないため次フレームへ送る。
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    }
    setOpen(false);
    if (unmountOnExit) {
      const id = setTimeout(() => setMounted(false), timeout);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [inProp, unmountOnExit, timeout]);

  if (unmountOnExit && !mounted) return null;

  const rootClass = [styles.root, open && styles.open, className].filter(Boolean).join(" ");

  return (
    <div className={rootClass} style={{ ["--collapse-duration" as string]: `${timeout}ms` }}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
