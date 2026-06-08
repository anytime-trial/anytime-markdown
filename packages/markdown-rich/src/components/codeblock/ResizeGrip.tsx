import React from "react";

import { getPrimaryMain, SMALL_CAPTION_FONT_SIZE, useIsDark } from "@anytime-markdown/markdown-viewer";

import styles from "./ResizeGrip.module.css";

interface ResizeGripProps {
  visible: boolean;
  resizing: boolean;
  resizeWidth: number | null;
  onPointerDown: (e: React.PointerEvent) => void;
}

/** ブロック要素右下のリサイズグリップ + リサイズ中のサイズ表示 */
export function ResizeGrip({ visible, resizing, resizeWidth, onPointerDown }: Readonly<ResizeGripProps>) {
  const isDark = useIsDark();
  return (
    <>
      {visible && (
        <div
          onPointerDown={onPointerDown}
          className={styles.grip}
          style={{ backgroundColor: getPrimaryMain(isDark) }}
        />
      )}
      {resizing && resizeWidth !== null && (
        <div
          className={styles.badge}
          style={{
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            fontSize: SMALL_CAPTION_FONT_SIZE,
          }}
        >
          {resizeWidth}px
        </div>
      )}
    </>
  );
}
