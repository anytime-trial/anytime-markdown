import { Box, useTheme } from "@mui/material";
import React from "react";

import { getPrimaryMain } from "../../constants/colors";
import { SMALL_CAPTION_FONT_SIZE } from "../../constants/dimensions";

interface ResizeGripProps {
  visible: boolean;
  resizing: boolean;
  resizeWidth: number | null;
  onPointerDown: (e: React.PointerEvent) => void;
}

/** ブロック要素右下のリサイズグリップ + リサイズ中のサイズ表示 */
export function ResizeGrip({ visible, resizing, resizeWidth, onPointerDown }: Readonly<ResizeGripProps>) {
  const isDark = useTheme().palette.mode === "dark";
  return (
    <>
      {visible && (
        <Box
          onPointerDown={onPointerDown}
          sx={{
            position: "absolute", right: 0, bottom: 0, width: 16, height: 16,
            cursor: "nwse-resize", bgcolor: getPrimaryMain(isDark), opacity: 0.7, borderTopLeftRadius: 4,
            "&:hover": { opacity: 1 },
            clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          }}
        />
      )}
      {resizing && resizeWidth !== null && (
        <Box sx={{
          position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
          bgcolor: "rgba(0,0,0,0.7)", color: "white", px: 1, py: 0.25,
          borderRadius: 1, fontSize: SMALL_CAPTION_FONT_SIZE, fontFamily: "monospace", pointerEvents: "none",
        }}>
          {resizeWidth}px
        </Box>
      )}
    </>
  );
}
