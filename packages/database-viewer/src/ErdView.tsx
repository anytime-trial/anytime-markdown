"use client";

import KeyIcon from "@mui/icons-material/VpnKey";
import { Box } from "@mui/material";
import React, { useMemo } from "react";
import type { GraphNode } from "@anytime-markdown/graph-core";
import type { ColumnInfo, SchemaInfo, TableInfo } from "@anytime-markdown/database-core";

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

  const { totalWidth, totalHeight } = useMemo(() => {
    if (cards.length === 0) return { totalWidth: 800, totalHeight: 600 };
    const maxX = Math.max(...cards.map((c) => c.node.x + c.node.width));
    const maxY = Math.max(...cards.map((c) => c.node.y + c.height));
    return { totalWidth: maxX + PADDING, totalHeight: maxY + PADDING };
  }, [cards]);

  if (!schema) return null;
  // KeyIcon import is referenced for future PK marker enhancement; tree-shake-safe.
  void KeyIcon;

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
        </defs>
        <rect x={0} y={0} width={totalWidth} height={totalHeight} fill="url(#erd-grid)" />
        {cards.map((c) => (
          <TableCardSvg key={c.node.id} card={c} isDark={isDark} />
        ))}
      </svg>
    </Box>
  );
};
