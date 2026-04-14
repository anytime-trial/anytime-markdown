import type { FlowGraph, FlowNode } from '@anytime-markdown/trail-core/analyzer';
import Box from '@mui/material/Box';
import { memo, useEffect, useRef } from 'react';
import { getC4Colors } from '../c4Theme';

const NODE_W = 140;
const NODE_H = 36;
const H_GAP = 60;
const V_GAP = 50;

interface Pos { x: number; y: number }

/** 簡易トポロジカルレイアウト（TB方向） */
function layoutNodes(graph: FlowGraph): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  if (graph.nodes.length === 0) return pos;

  // 各ノードの深さを BFS で計算
  const depth = new Map<string, number>();
  const startNode = graph.nodes.find(n => n.kind === 'start') ?? graph.nodes[0];
  const endNode = graph.nodes.find(n => n.kind === 'end');
  depth.set(startNode.id, 0);
  const queue = [startNode.id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = depth.get(cur) ?? 0;
    for (const e of graph.edges) {
      if (e.from === cur && !depth.has(e.to)) {
        depth.set(e.to, d + 1);
        queue.push(e.to);
      }
    }
  }
  // 残り（到達不能）は最大深さ+1
  let maxD = Math.max(0, ...[...depth.values()]);
  for (const n of graph.nodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxD + 1);
  }
  // end ノードは常に最下段に配置
  if (endNode) {
    maxD = Math.max(maxD, ...[...depth.values()]);
    depth.set(endNode.id, maxD + 1);
  }

  // 深さでグループ化
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    const arr = byDepth.get(d) ?? [];
    arr.push(id);
    byDepth.set(d, arr);
  }

  // barycenter ヒューリスティック: 各レベルをトップダウンに処理し、
  // 親ノードの平均 x 座標でソートして線の交差を削減する
  const xPos = new Map<string, number>();
  const maxDepthVal = Math.max(0, ...[...depth.values()]);

  for (let d = 0; d <= maxDepthVal; d++) {
    const ids = byDepth.get(d) ?? [];
    if (ids.length === 0) continue;

    if (d === 0) {
      // 最上段: 単純に均等配置
      ids.forEach((id, i) => {
        xPos.set(id, (NODE_W + H_GAP) * (i - (ids.length - 1) / 2));
      });
    } else {
      // 親ノードの平均 x を重心として計算
      const withBC = ids.map(id => {
        const parentXs = graph.edges
          .filter(e => e.to === id)
          .map(e => xPos.get(e.from) ?? 0);
        const bc = parentXs.length > 0
          ? parentXs.reduce((s, x) => s + x, 0) / parentXs.length
          : 0;
        return { id, bc };
      });
      // 重心でソートして横順序を決定
      withBC.sort((a, b) => a.bc - b.bc);
      const total = withBC.length;
      withBC.forEach(({ id }, i) => {
        xPos.set(id, (NODE_W + H_GAP) * (i - (total - 1) / 2));
      });
    }
  }

  for (const [id, d] of depth) {
    pos.set(id, { x: xPos.get(id) ?? 0, y: d * (NODE_H + V_GAP) });
  }

  return pos;
}

function getNodeColor(kind: FlowNode['kind'], isDark: boolean): string {
  const palette: Record<FlowNode['kind'], string> = {
    start: isDark ? '#2e7d32' : '#66bb6a',
    end: isDark ? '#b71c1c' : '#ef5350',
    process: isDark ? '#1565c0' : '#42a5f5',
    decision: isDark ? '#e65100' : '#ffa726',
    loop: isDark ? '#4a148c' : '#ab47bc',
    call: isDark ? '#00695c' : '#26a69a',
    return: isDark ? '#37474f' : '#90a4ae',
    error: isDark ? '#c62828' : '#ef9a9a',
  };
  return palette[kind];
}

interface FlowchartCanvasProps {
  readonly graph: FlowGraph;
  readonly isDark?: boolean;
  readonly errorMessage?: string | null;
}

export const FlowchartCanvas = memo(({ graph, isDark = true, errorMessage }: Readonly<FlowchartCanvasProps>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = getC4Colors(isDark);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = globalThis.devicePixelRatio ?? 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (errorMessage) {
      ctx.fillStyle = colors.text;
      ctx.font = '14px sans-serif';
      ctx.fillText(errorMessage, 20, 40);
      return;
    }
    if (graph.nodes.length === 0) {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '13px sans-serif';
      ctx.fillText('No flow data.', 20, 40);
      return;
    }

    const posMap = layoutNodes(graph);
    // 描画原点をキャンバス中央に
    const cx = w / 2;
    const cy = 40;

    // エッジを描画
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1.5;
    for (const edge of graph.edges) {
      const from = posMap.get(edge.from);
      const to = posMap.get(edge.to);
      if (!from || !to) continue;
      const fx = cx + from.x + NODE_W / 2;
      const fy = cy + from.y + NODE_H;
      const tx = cx + to.x + NODE_W / 2;
      const ty = cy + to.y;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.bezierCurveTo(fx, fy + 20, tx, ty - 20, tx, ty);
      ctx.stroke();
      // ラベル
      if (edge.label) {
        ctx.fillStyle = colors.textSecondary;
        ctx.font = '10px sans-serif';
        ctx.fillText(edge.label, (fx + tx) / 2 + 4, (fy + ty) / 2);
      }
    }

    // ノードを描画
    for (const node of graph.nodes) {
      const p = posMap.get(node.id);
      if (!p) continue;
      const x = cx + p.x;
      const y = cy + p.y;
      const fill = getNodeColor(node.kind, isDark);

      ctx.fillStyle = fill;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;

      if (node.kind === 'decision') {
        // ひし形
        const mx = x + NODE_W / 2;
        const my = y + NODE_H / 2;
        ctx.beginPath();
        ctx.moveTo(mx, y);
        ctx.lineTo(x + NODE_W, my);
        ctx.lineTo(mx, y + NODE_H);
        ctx.lineTo(x, my);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (node.kind === 'start' || node.kind === 'end') {
        // 楕円
        ctx.beginPath();
        ctx.ellipse(x + NODE_W / 2, y + NODE_H / 2, NODE_W / 2, NODE_H / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // 角丸矩形
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + NODE_W - r, y);
        ctx.arcTo(x + NODE_W, y, x + NODE_W, y + r, r);
        ctx.lineTo(x + NODE_W, y + NODE_H - r);
        ctx.arcTo(x + NODE_W, y + NODE_H, x + NODE_W - r, y + NODE_H, r);
        ctx.lineTo(x + r, y + NODE_H);
        ctx.arcTo(x, y + NODE_H, x, y + NODE_H - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // ラベル
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const truncated = node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label;
      ctx.fillText(truncated, x + NODE_W / 2, y + NODE_H / 2);
      ctx.textAlign = 'left';
    }
  }, [graph, isDark, errorMessage, colors]);

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-label="flowchart"
        role="img"
      />
    </Box>
  );
});
FlowchartCanvas.displayName = 'FlowchartCanvas';
