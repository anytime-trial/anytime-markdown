"use client";

import KeyIcon from "@mui/icons-material/VpnKey";
import { Box, IconButton, Stack, Tooltip } from "@mui/material";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@anytime-markdown/graph-core";
import { engine } from "@anytime-markdown/graph-core";
import type { ColumnInfo, SchemaInfo, TableInfo } from "@anytime-markdown/database-core";

export interface ErdViewProps {
  readonly schema: SchemaInfo | null;
  readonly themeMode?: "light" | "dark";
}

const CARD_WIDTH = 280;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 28;
const COLS = 4;
const GAP_X = 60;
const GAP_Y = 80;
const PADDING = 40;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

interface ErdEdge {
  readonly id: string;
  readonly fromTable: string;
  readonly fromColumn: string;
  readonly toTable: string;
  readonly toColumn: string;
}

interface TableCard {
  readonly node: GraphNode;
  readonly table: TableInfo;
  readonly height: number;
}

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

function buildBaseCards(tables: ReadonlyArray<TableInfo>, edges: ReadonlyArray<ErdEdge>): TableCard[] {
  // 初期グリッド配置 (一旦並べる)
  const cards: TableCard[] = [];
  for (let idx = 0; idx < tables.length; idx++) {
    const table = tables[idx];
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    const height = HEADER_HEIGHT + table.columns.length * ROW_HEIGHT;
    const rowSlice = tables.slice(row * COLS, row * COLS + COLS);
    const rowMaxH = Math.max(
      ...rowSlice.map((tt) => HEADER_HEIGHT + tt.columns.length * ROW_HEIGHT),
      HEADER_HEIGHT,
    );
    const node: GraphNode = {
      id: `table:${table.name}`,
      type: "rect",
      x: PADDING + col * (CARD_WIDTH + GAP_X),
      y: PADDING + row * (rowMaxH + GAP_Y),
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
  }

  // Sugiyama-style hierarchical layout で配置を最適化 (線の重なりを最小化)
  if (cards.length > 0) {
    const bodies = new Map<string, engine.physics.PhysicsBody>();
    for (const c of cards) {
      bodies.set(c.node.id, {
        id: c.node.id,
        x: c.node.x,
        y: c.node.y,
        vx: 0,
        vy: 0,
        fx: 0,
        fy: 0,
        width: c.node.width,
        height: c.height,
        fixed: false,
        mass: 1,
      });
    }
    const graphEdges: GraphEdge[] = edges.map((e) => ({
      id: e.id,
      type: "connector",
      from: { nodeId: `table:${e.fromTable}`, x: 0, y: 0 },
      to: { nodeId: `table:${e.toTable}`, x: 0, y: 0 },
      style: {
        stroke: "#888",
        strokeWidth: 1,
        routing: "orthogonal",
      },
    }));
    // 横方向 (LR) 配置: 参照元 → 参照先 が左→右で並ぶようにする
    engine.physics.computeHierarchicalLayout(bodies, graphEdges, "LR", 360, 60);
    // 計算結果を反映 (上端 y を 0 ベース、左端 x を PADDING に正規化)
    let minX = Infinity;
    let minY = Infinity;
    for (const c of cards) {
      const b = bodies.get(c.node.id);
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
    }
    if (!Number.isFinite(minX)) minX = 0;
    if (!Number.isFinite(minY)) minY = 0;
    return cards.map((c) => {
      const b = bodies.get(c.node.id);
      if (!b) return c;
      return {
        ...c,
        node: {
          ...c.node,
          x: PADDING + (b.x - minX),
          y: PADDING + (b.y - minY),
        },
      };
    });
  }
  return cards;
}

function inferEdges(schema: SchemaInfo): ErdEdge[] {
  const list: ErdEdge[] = [];
  const seen = new Set<string>();
  // 1. 明示的な FK
  for (const t of schema.tables) {
    for (const fk of t.foreignKeys ?? []) {
      const id = `${t.name}.${fk.fromColumn}->${fk.toTable}.${fk.toColumn}`;
      if (seen.has(id)) continue;
      seen.add(id);
      list.push({
        id,
        fromTable: t.name,
        fromColumn: fk.fromColumn,
        toTable: fk.toTable,
        toColumn: fk.toColumn,
      });
    }
  }

  // 2. ヒューリスティック: PK が "id" の他テーブルに対し、自テーブルに `<table>_id` カラムがあれば link
  const allTables = schema.tables;
  const pkByTable = new Map<string, ColumnInfo[]>();
  for (const t of allTables) {
    pkByTable.set(t.name, t.columns.filter((c) => c.primaryKey));
  }
  for (const from of allTables) {
    for (const fc of from.columns) {
      // パターン A: <table>_id 形式
      const m = /^(.+)_id$/.exec(fc.name);
      if (m) {
        const baseName = m[1];
        const candidates = [baseName, baseName + "s", baseName + "es"]; // 単純化
        for (const cand of candidates) {
          const target = allTables.find((tt) => tt.name === cand);
          if (target && target.name !== from.name) {
            const targetPk = pkByTable.get(target.name)?.[0];
            if (!targetPk) break;
            const id = `${from.name}.${fc.name}->${target.name}.${targetPk.name}`;
            if (seen.has(id)) break;
            seen.add(id);
            list.push({
              id,
              fromTable: from.name,
              fromColumn: fc.name,
              toTable: target.name,
              toColumn: targetPk.name,
            });
            break;
          }
        }
      }
    }
  }

  // 3. ヒューリスティック: 同名カラムが他テーブルの PK にある場合 (例: id 自体は除外)
  for (const from of allTables) {
    for (const fc of from.columns) {
      if (fc.primaryKey) continue;
      if (fc.name === "id") continue;
      for (const to of allTables) {
        if (to.name === from.name) continue;
        const matchedPk = (pkByTable.get(to.name) ?? []).find((p) => p.name === fc.name);
        if (!matchedPk) continue;
        const id = `${from.name}.${fc.name}->${to.name}.${matchedPk.name}`;
        if (seen.has(id)) continue;
        seen.add(id);
        list.push({
          id,
          fromTable: from.name,
          fromColumn: fc.name,
          toTable: to.name,
          toColumn: matchedPk.name,
        });
      }
    }
  }
  return list;
}

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
      <g transform={`translate(14, ${ROW_HEIGHT / 2})`}>
        {column.primaryKey ? (
          <circle r={5} fill="#f5b400" stroke="#a37b00" strokeWidth={0.5} />
        ) : (
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
  dimmed,
  selected,
  onPointerDownHeader,
  onClick,
}: Readonly<{
  card: TableCard;
  isDark: boolean;
  dimmed: boolean;
  selected: boolean;
  onPointerDownHeader: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}>): React.ReactElement {
  const { node, table } = card;
  const headerFill = selected
    ? (isDark ? "#1f3a5f" : "#cfe1ff")
    : (isDark ? "#0e1116" : "#e9ecef");
  const headerText = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.87)";
  const cardFill = isDark ? "#181c22" : "#ffffff";
  const stroke = selected ? "#3aa0ff" : (isDark ? "#3a4148" : "#c8ccd1");
  const strokeWidth = selected ? 2 : 1;
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      opacity={dimmed ? 0.18 : 1}
      onClick={onClick}
      style={{ cursor: dimmed ? "default" : "pointer" }}
    >
      <rect
        x={0}
        y={0}
        width={CARD_WIDTH}
        height={card.height}
        rx={6}
        ry={6}
        fill={cardFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <rect
        x={0}
        y={0}
        width={CARD_WIDTH}
        height={HEADER_HEIGHT}
        rx={6}
        ry={6}
        fill={headerFill}
        style={{ cursor: "move" }}
        onPointerDown={onPointerDownHeader}
      />
      <rect x={0} y={HEADER_HEIGHT - 6} width={CARD_WIDTH} height={6} fill={headerFill}
        style={{ cursor: "move" }} onPointerDown={onPointerDownHeader} />
      <text x={14} y={HEADER_HEIGHT / 2 + 5} fontSize={14} fontWeight={600} fill={headerText}
        pointerEvents="none">
        {table.name}
      </text>
      {table.columns.map((c, i) => (
        <ColumnRow key={c.name} column={c} isDark={isDark} y={HEADER_HEIGHT + i * ROW_HEIGHT} />
      ))}
    </g>
  );
}

interface MinimapProps {
  readonly cards: readonly TableCard[];
  readonly viewport: Viewport;
  readonly viewSize: { width: number; height: number };
  readonly worldBounds: { minX: number; minY: number; maxX: number; maxY: number };
  readonly onChange: (vp: Viewport) => void;
  readonly isDark: boolean;
}

const MINIMAP_W = 200;
const MINIMAP_H = 130;

function Minimap({ cards, viewport, viewSize, worldBounds, onChange, isDark }: Readonly<MinimapProps>): React.ReactElement {
  const w = worldBounds.maxX - worldBounds.minX || 1;
  const h = worldBounds.maxY - worldBounds.minY || 1;
  const scale = Math.min(MINIMAP_W / w, MINIMAP_H / h);
  const ox = (MINIMAP_W - w * scale) / 2 - worldBounds.minX * scale;
  const oy = (MINIMAP_H - h * scale) / 2 - worldBounds.minY * scale;

  // current viewport rect in world coords
  const visX = -viewport.x / viewport.zoom;
  const visY = -viewport.y / viewport.zoom;
  const visW = viewSize.width / viewport.zoom;
  const visH = viewSize.height / viewport.zoom;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - ox) / scale;
    const wy = (my - oy) / scale;
    onChange({
      ...viewport,
      x: -(wx - viewSize.width / 2 / viewport.zoom) * viewport.zoom,
      y: -(wy - viewSize.height / 2 / viewport.zoom) * viewport.zoom,
    });
  };

  return (
    <Box
      sx={{
        position: "absolute",
        right: 16,
        bottom: 16,
        width: MINIMAP_W,
        height: MINIMAP_H,
        borderRadius: 1,
        overflow: "hidden",
        border: 1,
        borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
        background: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(2px)",
      }}
    >
      <svg
        width={MINIMAP_W}
        height={MINIMAP_H}
        onPointerDown={handlePointerDown}
        style={{ cursor: "pointer" }}
      >
        {cards.map((c) => (
          <rect
            key={c.node.id}
            x={ox + c.node.x * scale}
            y={oy + c.node.y * scale}
            width={c.node.width * scale}
            height={c.height * scale}
            fill={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"}
            stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"}
            strokeWidth={0.5}
          />
        ))}
        <rect
          x={ox + visX * scale}
          y={oy + visY * scale}
          width={visW * scale}
          height={visH * scale}
          fill="none"
          stroke="#3aa0ff"
          strokeWidth={1.5}
        />
      </svg>
    </Box>
  );
}

export const ErdView: React.FC<Readonly<ErdViewProps>> = ({ schema, themeMode = "dark" }) => {
  const isDark = themeMode === "dark";

  // edges を先に計算してから layout に利用する
  const inferredEdges = useMemo<ErdEdge[]>(() => {
    if (!schema) return [];
    return inferEdges(schema);
  }, [schema]);

  const baseCards = useMemo(() => {
    if (!schema) return [];
    return buildBaseCards([...schema.tables, ...schema.views], inferredEdges);
  }, [schema, inferredEdges]);

  // ノード位置オーバーライド (ドラッグで更新)
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  // baseCards 更新時に positions をリセット (新しいスキーマ)
  useEffect(() => {
    setPositions(new Map());
  }, [baseCards]);

  const cards = useMemo<TableCard[]>(() => {
    return baseCards.map((c) => {
      const override = positions.get(c.node.id);
      if (!override) return c;
      return {
        ...c,
        node: { ...c.node, x: override.x, y: override.y },
      };
    });
  }, [baseCards, positions]);

  const cardByTable = useMemo(() => {
    const m = new Map<string, TableCard>();
    cards.forEach((c) => m.set(c.table.name, c));
    return m;
  }, [cards]);

  const edges = inferredEdges;

  const worldBounds = useMemo(() => {
    if (cards.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of cards) {
      minX = Math.min(minX, c.node.x);
      minY = Math.min(minY, c.node.y);
      maxX = Math.max(maxX, c.node.x + c.node.width);
      maxY = Math.max(maxY, c.node.y + c.height);
    }
    return {
      minX: minX - PADDING,
      minY: minY - PADDING,
      maxX: maxX + PADDING,
      maxY: maxY + PADDING,
    };
  }, [cards]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ width: 800, height: 600 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  // 選択中のテーブル名 (クリックで設定、背景クリック / 同じテーブル再クリックで解除)
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // 選択中テーブルと直接 edge で接続するテーブル名集合
  const relatedTables = useMemo<ReadonlySet<string>>(() => {
    if (!selectedTable) return new Set();
    const set = new Set<string>([selectedTable]);
    for (const e of edges) {
      if (e.fromTable === selectedTable) set.add(e.toTable);
      else if (e.toTable === selectedTable) set.add(e.fromTable);
    }
    return set;
  }, [selectedTable, edges]);

  // ResizeObserver で view size を追跡
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setViewSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, []);

  // ドラッグ状態
  const dragRef = useRef<
    | { kind: "card"; tableName: string; offsetX: number; offsetY: number }
    | { kind: "pan"; startX: number; startY: number; startVpX: number; startVpY: number }
    | null
  >(null);

  const screenToWorld = useCallback(
    (sx: number, sy: number): { x: number; y: number } => {
      return {
        x: (sx - viewport.x) / viewport.zoom,
        y: (sy - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const handlePointerDownBackground = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      const target = e.target as Element;
      // 背景 (rect.erd-bg) のみパン + 選択解除
      if (!target.classList?.contains("erd-bg")) return;
      setSelectedTable(null);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        startVpX: viewport.x,
        startVpY: viewport.y,
      };
    },
    [viewport],
  );

  const onCardHeaderPointerDown = useCallback(
    (tableName: string) => (e: React.PointerEvent): void => {
      e.stopPropagation();
      const card = cardByTable.get(tableName);
      if (!card) return;
      const rect = (e.currentTarget as Element).closest("svg")?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = screenToWorld(sx, sy);
      dragRef.current = {
        kind: "card",
        tableName,
        offsetX: wp.x - card.node.x,
        offsetY: wp.y - card.node.y,
      };
      (e.currentTarget as Element).closest("svg")?.setPointerCapture?.(e.pointerId);
    },
    [cardByTable, screenToWorld],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "pan") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setViewport((v) => ({ ...v, x: drag.startVpX + dx, y: drag.startVpY + dy }));
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const wp = screenToWorld(sx, sy);
        const x = wp.x - drag.offsetX;
        const y = wp.y - drag.offsetY;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(`table:${drag.tableName}`, { x, y });
          return next;
        });
      }
    },
    [screenToWorld],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    },
    [],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>): void => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // zoom を更新するが、マウス位置を world 上で固定するように viewport を補正
      const factor = Math.exp(-e.deltaY * 0.0015);
      setViewport((v) => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
        const wpX = (sx - v.x) / v.zoom;
        const wpY = (sy - v.y) / v.zoom;
        return {
          zoom: newZoom,
          x: sx - wpX * newZoom,
          y: sy - wpY * newZoom,
        };
      });
    },
    [],
  );

  const fitToContent = useCallback(() => {
    const w = worldBounds.maxX - worldBounds.minX;
    const h = worldBounds.maxY - worldBounds.minY;
    if (w <= 0 || h <= 0 || viewSize.width <= 0 || viewSize.height <= 0) return;
    const zoom = Math.min(viewSize.width / w, viewSize.height / h, 1);
    setViewport({
      zoom,
      x: -worldBounds.minX * zoom + (viewSize.width - w * zoom) / 2,
      y: -worldBounds.minY * zoom + (viewSize.height - h * zoom) / 2,
    });
  }, [worldBounds, viewSize]);

  const zoomBy = useCallback((factor: number) => {
    setViewport((v) => {
      const cx = viewSize.width / 2;
      const cy = viewSize.height / 2;
      const wpX = (cx - v.x) / v.zoom;
      const wpY = (cy - v.y) / v.zoom;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
      return {
        zoom: newZoom,
        x: cx - wpX * newZoom,
        y: cy - wpY * newZoom,
      };
    });
  }, [viewSize]);

  if (!schema) return null;
  void KeyIcon;
  const edgeColor = isDark ? "rgba(120,170,255,0.85)" : "rgba(0,90,220,0.85)";

  return (
    <Box
      ref={containerRef}
      sx={{
        flexGrow: 1,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
        background: isDark ? "#0c0e10" : "#f5f7fa",
      }}
    >
      <svg
        width="100%"
        height="100%"
        onPointerDown={handlePointerDownBackground}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        style={{ display: "block", touchAction: "none" }}
      >
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
        <rect className="erd-bg" x={0} y={0} width="100%" height="100%" fill="url(#erd-grid)" />
        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
          {edges.map((e) => {
            const fromCard = cardByTable.get(e.fromTable);
            const toCard = cardByTable.get(e.toTable);
            if (!fromCard || !toCard) return null;
            const fromColIdx = fromCard.table.columns.findIndex((c) => c.name === e.fromColumn);
            const fromY =
              fromCard.node.y + HEADER_HEIGHT + (fromColIdx < 0 ? 0 : fromColIdx) * ROW_HEIGHT + ROW_HEIGHT / 2;
            const fromCx = fromCard.node.x + fromCard.node.width / 2;
            const toCx = toCard.node.x + toCard.node.width / 2;
            const toCy = toCard.node.y + toCard.height / 2;
            const fromX = toCx >= fromCx ? fromCard.node.x + fromCard.node.width : fromCard.node.x;
            const toBorder = rectBorderPoint(toCx, toCy, toCard.node.width, toCard.height, fromX, fromY);
            const midX = (fromX + toBorder.x) / 2;
            const path = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toBorder.y} L ${toBorder.x} ${toBorder.y}`;
            const isRelated =
              !selectedTable || e.fromTable === selectedTable || e.toTable === selectedTable;
            return (
              <g key={e.id} opacity={isRelated ? 1 : 0.12}>
                <path
                  d={path}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={isRelated && selectedTable ? 2 : 1.5}
                  markerEnd="url(#erd-arrow)"
                />
                <circle cx={fromX} cy={fromY} r={3} fill={edgeColor} />
              </g>
            );
          })}
          {cards.map((c) => {
            const dimmed = selectedTable !== null && !relatedTables.has(c.table.name);
            const sel = selectedTable === c.table.name;
            return (
              <TableCardSvg
                key={c.node.id}
                card={c}
                isDark={isDark}
                dimmed={dimmed}
                selected={sel}
                onPointerDownHeader={onCardHeaderPointerDown(c.table.name)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTable((prev) => (prev === c.table.name ? null : c.table.name));
                }}
              />
            );
          })}
        </g>
      </svg>
      {/* Toolbar */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          position: "absolute",
          left: 16,
          top: 16,
          background: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)",
          borderRadius: 1,
          p: 0.5,
          backdropFilter: "blur(2px)",
        }}
      >
        <Tooltip title="Zoom in">
          <IconButton size="small" onClick={() => zoomBy(1.2)}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom out">
          <IconButton size="small" onClick={() => zoomBy(1 / 1.2)}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit">
          <IconButton size="small" onClick={fitToContent}>
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Minimap
        cards={cards}
        viewport={viewport}
        viewSize={viewSize}
        worldBounds={worldBounds}
        onChange={setViewport}
        isDark={isDark}
      />
    </Box>
  );
};
