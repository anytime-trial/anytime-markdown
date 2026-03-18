"use client";

import type { ImageAnnotation } from "../types/imageAnnotation";

interface AnnotationOverlayProps {
  annotations: ImageAnnotation[];
  style?: React.CSSProperties;
}

function renderAnnotation(a: ImageAnnotation) {
  const stroke = a.color;
  const strokeWidth = 2;
  const fill = "none";
  switch (a.type) {
    case "rect": {
      const x = Math.min(a.x1, a.x2);
      const y = Math.min(a.y1, a.y2);
      const w = Math.abs(a.x2 - a.x1);
      const h = Math.abs(a.y2 - a.y1);
      return <rect key={a.id} x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
    }
    case "circle": {
      const cx = (a.x1 + a.x2) / 2;
      const cy = (a.y1 + a.y2) / 2;
      const rx = Math.abs(a.x2 - a.x1) / 2;
      const ry = Math.abs(a.y2 - a.y1) / 2;
      return <ellipse key={a.id} cx={cx} cy={cy} rx={rx} ry={ry} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
    }
    case "line":
      return <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={stroke} strokeWidth={strokeWidth} />;
    default:
      return null;
  }
}

/** 画像上に SVG でアノテーションを描画する読み取り専用オーバーレイ */
export function AnnotationOverlay({ annotations, style }: AnnotationOverlayProps) {
  if (annotations.length === 0) return null;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        ...style,
      }}
    >
      {annotations.map(renderAnnotation)}
    </svg>
  );
}
