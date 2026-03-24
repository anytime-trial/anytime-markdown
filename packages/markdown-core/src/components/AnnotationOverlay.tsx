"use client";

import type { ImageAnnotation } from "../types/imageAnnotation";

interface AnnotationOverlayProps {
  annotations: ImageAnnotation[];
  style?: React.CSSProperties;
}

function renderAnnotation(a: ImageAnnotation, index: number) {
  const stroke = a.color;
  const strokeWidth = 2;
  const fill = "none";
  const badgeX = Math.min(a.x1, a.x2);
  const badgeY = Math.min(a.y1, a.y2);

  return (
    <g key={a.id}>
      {a.type === "rect" && (
        <rect
          x={Math.min(a.x1, a.x2)} y={Math.min(a.y1, a.y2)}
          width={Math.abs(a.x2 - a.x1)} height={Math.abs(a.y2 - a.y1)}
          stroke={stroke} strokeWidth={strokeWidth} fill={fill}
        />
      )}
      {a.type === "circle" && (
        <ellipse
          cx={(a.x1 + a.x2) / 2} cy={(a.y1 + a.y2) / 2}
          rx={Math.abs(a.x2 - a.x1) / 2} ry={Math.abs(a.y2 - a.y1) / 2}
          stroke={stroke} strokeWidth={strokeWidth} fill={fill}
        />
      )}
      {a.type === "line" && (
        <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={stroke} strokeWidth={strokeWidth} />
      )}
      <circle cx={badgeX} cy={badgeY} r={2.5} fill={stroke} />
      <text x={badgeX} y={badgeY} textAnchor="middle" dominantBaseline="central" fontSize={3} fill="white" fontWeight="bold" style={{ pointerEvents: "none" }}>
        {index + 1}
      </text>
    </g>
  );
}

/** 画像上に SVG でアノテーションを描画する読み取り専用オーバーレイ */
export function AnnotationOverlay({ annotations, style }: Readonly<AnnotationOverlayProps>) {
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
      {annotations.map((a, i) => renderAnnotation(a, i))}
    </svg>
  );
}
