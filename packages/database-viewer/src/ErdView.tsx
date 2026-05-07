"use client";

import KeyIcon from "@mui/icons-material/VpnKey";
import { Box } from "@mui/material";
import React, { useMemo } from "react";
import type { GraphNode } from "@anytime-markdown/graph-core";
import type { ColumnInfo, SchemaInfo, TableInfo } from "@anytime-markdown/database-core";

interface ErdEdge {
  readonly id: string;
  readonly fromTable: string;
  readonly fromColumn: string;
  readonly toTable: string;
  readonly toColumn: string;
}

/** 直線が矩形 (cx-w/2..cx+w/2, cy-h/2..cy+h/2) と交わる点を求める。中心 (cx,cy) から外向き */
function rectBorderPoint(
  cx: number,
  cy: number,
  w: number,
  h: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = w / 2;
  const halfH = h / 2;
  const tX = halfW / Math.abs(dx || 1);
  const tY = halfH / Math.abs(dy || 1);
  const t = Math.min(tX, tY);
  return { x: cx + dx * t, y: cy + dy * t };
}

export interface ErdViewProps {
  readonly schema: SchemaInfo | null;
  readonly themeMode?: "light" | "dark";
}

const CARD_WIDTH = 280;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 28;
const COLS = 4; // 横方向の最大カラム数
const GAP_X = 60;
const GAP_Y = 80;
const PADDING = 40;

interface TableCard {
  readonly node: GraphNode;
  readonly table: TableInfo;
  readonly height: number;
}

function buildCards(tables: ReadonlyArray<TableInfo>): TableCard[] {
  const cards: TableCard[] = [];
  tables.forEach((table, idx) => {
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    const height = HEADER_HEIGHT + table.columns.length * ROW_HEIGHT;
    const node: GraphNode = {
      id: `table:${table.name}`,
      type: "rect",
      x: PADDING + col * (CARD_WIDTH + GAP_X),
      y: PADDING + row * (Math.max(...tables.slice(row * COLS, row * COLS + COLS).map((tt) => HEADER_HEIGHT + tt.columns.length * ROW_HEIGHT), HEADER_HEIGHT) + GAP_Y),
      width: CARD_WIDTH,
      height,
      style: {
        fill: "#1e2228",
        stroke: "#3a4148",
        strokeWidth: 1,
        fontSize: 13,
        fontFamily: "system-ui, sans-serif",
        borderRadius: 6,
      },
      text: table.name,
    };
    cards.push({ node, table, height });
  });
  return cards;
}

function ColumnRow({
  column,
  isDark,
  y,
}: Readonly<{ column: ColumnInfo; isDark: boolean; y: number }>): React.ReactElement {
  const textColor = isDark ? "rgba(255,255,255,0.87)" : "rgba(0,0,0,0.87)";
  const typeColor = isDark ? "rgba(255,180,84,0.85)" : "rgba(180,90,0,0.85)";
  const dimText = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";
  const markerFill = column.notNull ? (isDark ? "#bbb" : "#444") : "transparent";
  const markerStroke = isDark ? "#bbb" : "#444";
  return (
    <g transform={`translate(0, ${y})`}>
      <line x1={0} x2={CARD_WIDTH} y1={0} y2={0} stroke={isDark ? "#2a2f36" : "#d0d4d9"} strokeWidth={0.5} />
      {/* PK / NOT NULL marker */}
      <g transform={`translate(14, ${ROW_HEIGHT / 2})`}>
        {column.primaryKey ? (
          // 鍵アイコン代わりの星形マーカー
          <circle r={5} fill="#f5b400" stroke="#a37b00" strokeWidth={0.5} />
        ) : (
          // 菱形マーカー: 塗り = NOT NULL, 中抜き = NULL
          <polygon
            points="0,-5 5,0 0,5 -5,0"
            fill={markerFill}
            stroke={markerStroke}
            strokeWidth={1}
          />
        )}
      </g>
      <text x={28} y={ROW_HEIGHT / 2 + 4} fontSize={13} fill={column.notNull ? textColor : dimText}>
        {column.name}
      </text>
      <text
        x={CARD_WIDTH - 12}
        y={ROW_HEIGHT / 2 + 4}
        fontSize={11}
        fill={typeColor}
        textAnchor="end"
        fontFamily="ui-monospace, monospace"
      >
        {column.type || "—"}
      </text>
    </g>
  );
}

function TableCardSvg({
  card,
  isDark,
}: Readonly<{ card: TableCard; isDark: boolean }>): React.ReactElement {
  const { node, table } = card;
  const headerFill = isDark ? "#0e1116" : "#e9ecef";
  const headerText = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.87)";
  const cardFill = isDark ? "#181c22" : "#ffffff";
  const stroke = isDark ? "#3a4148" : "#c8ccd1";
  return (
    <g transform={`translate(${node.x}, ${node.y})`}>
      {/* card body */}
      <rect
        x={0}
        y={0}
        width={CARD_WIDTH}
        height={card.height}
        rx={6}
        ry={6}
        fill={cardFill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* header */}
      <rect x={0} y={0} width={CARD_WIDTH} height={HEADER_HEIGHT} rx={6} ry={6} fill={headerFill} />
      <rect x={0} y={HEADER_HEIGHT - 6} width={CARD_WIDTH} height={6} fill={headerFill} />
      <text x={14} y={HEADER_HEIGHT / 2 + 5} fontSize={14} fontWeight={600} fill={headerText}>
        {table.name}
      </text>
      {/* columns */}
      {table.columns.map((c, i) => (
        <ColumnRow key={c.name} column={c} isDark={isDark} y={HEADER_HEIGHT + i * ROW_HEIGHT} />
      ))}
    </g>
  );
}

export const ErdView: React.FC<Readonly<ErdViewProps>> = ({ schema, themeMode = "dark" }) => {
  const isDark = themeMode === "dark";
  const cards = useMemo(() => {
    if (!schema) return [];
    const tables = [...schema.tables, ...schema.views];
    return buildCards(tables);
  }, [schema]);

  // 外部キー関係のエッジ
  const edges = useMemo<ErdEdge[]>(() => {
    if (!schema) return [];
    const list: ErdEdge[] = [];
    for (const t of schema.tables) {
      for (const fk of t.foreignKeys ?? []) {
        list.push({
          id: `${t.name}.${fk.fromColumn}->${fk.toTable}.${fk.toColumn}`,
          fromTable: t.name,
          fromColumn: fk.fromColumn,
          toTable: fk.toTable,
          toColumn: fk.toColumn,
        });
      }
    }
    return list;
  }, [schema]);

  const { totalWidth, totalHeight } = useMemo(() => {
    if (cards.length === 0) return { totalWidth: 800, totalHeight: 600 };
    const maxX = Math.max(...cards.map((c) => c.node.x + c.node.width));
    const maxY = Math.max(...cards.map((c) => c.node.y + c.height));
    return { totalWidth: maxX + PADDING, totalHeight: maxY + PADDING };
  }, [cards]);

  if (!schema) return null;
  // KeyIcon import is referenced for future PK marker enhancement; tree-shake-safe.
  void KeyIcon;

  const cardByTable = new Map<string, TableCard>();
  cards.forEach((c) => cardByTable.set(c.table.name, c));
  const edgeColor = isDark ? "rgba(120,170,255,0.85)" : "rgba(0,90,220,0.85)";

  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        overflow: "auto",
        background: isDark ? "#0c0e10" : "#f5f7fa",
        // VS Code WebView 用にスクロールバーを視認できる太さに
        scrollbarWidth: "auto",
        scrollbarColor: isDark
          ? "rgba(255,255,255,0.55) rgba(255,255,255,0.05)"
          : "rgba(0,0,0,0.5) rgba(0,0,0,0.05)",
        "&::-webkit-scrollbar": { width: 12, height: 12 },
        "&::-webkit-scrollbar-thumb": {
          background: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
          borderRadius: 3,
        },
      }}
    >
      <svg width={totalWidth} height={totalHeight}>
        {/* dot grid background */}
        <defs>
          <pattern id="erd-grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={0.8} fill={isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"} />
          </pattern>
          <marker
            id="erd-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor} />
          </marker>
        </defs>
        <rect x={0} y={0} width={totalWidth} height={totalHeight} fill="url(#erd-grid)" />
        {/* edges (描画前にカードを描く方が良いが、矢印はカードの上にも見える orth 配置で問題なし) */}
        {edges.map((e) => {
          const fromCard = cardByTable.get(e.fromTable);
          const toCard = cardByTable.get(e.toTable);
          if (!fromCard || !toCard) return null;
          // 自テーブル側はカラム行の中央 Y を計算
          const fromColIdx = fromCard.table.columns.findIndex((c) => c.name === e.fromColumn);
          const fromY = fromCard.node.y + HEADER_HEIGHT + (fromColIdx < 0 ? 0 : fromColIdx) * ROW_HEIGHT + ROW_HEIGHT / 2;
          const fromCx = fromCard.node.x + fromCard.node.width / 2;
          // 参照先カード中央
          const toCx = toCard.node.x + toCard.node.width / 2;
          const toCy = toCard.node.y + toCard.height / 2;
          // 自テーブルからは横方向 (left/right) の境界を起点にしたい → fromCx 比較
          const fromX = toCx >= fromCx
            ? fromCard.node.x + fromCard.node.width
            : fromCard.node.x;
          // 参照先カードは中心方向の境界
          const toBorder = rectBorderPoint(toCx, toCy, toCard.node.width, toCard.height, fromX, fromY);
          // 中間点 (orthogonal-ish): fromX を起点に水平 → 中点で垂直 → toBorder
          const midX = (fromX + toBorder.x) / 2;
          const path = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toBorder.y} L ${toBorder.x} ${toBorder.y}`;
          return (
            <g key={e.id}>
              <path
                d={path}
                fill="none"
                stroke={edgeColor}
                strokeWidth={1.5}
                markerEnd="url(#erd-arrow)"
              />
              <circle cx={fromX} cy={fromY} r={3} fill={edgeColor} />
            </g>
          );
        })}
        {cards.map((c) => (
          <TableCardSvg key={c.node.id} card={c} isDark={isDark} />
        ))}
      </svg>
    </Box>
  );
};
