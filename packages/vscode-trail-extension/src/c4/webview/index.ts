import type { GraphDocument, Viewport, GraphNode, GraphEdge } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups } from '@anytime-markdown/graph-core';
import { c4ToGraphDocument, buildLevelView } from '@anytime-markdown/c4-kernel';
import type { C4Model, BoundaryInfo } from '@anytime-markdown/c4-kernel';

const { render, pan, zoom, fitToContent, resolveConnectorEndpoints, screenToWorld } = engine;

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// --- State ---

let fullDocument: GraphDocument | null = null;
let document: GraphDocument | null = null;
let viewport: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
let currentLevel = 4;
let selectedNodeIds: string[] = [];
const HIGHLIGHT_FILL = '#3d2645';
/** ハイライト中のノードと元の fill を保持 */
let highlightedNodes = new Map<string, string>();

// --- Canvas setup ---

const canvas = globalThis.document.getElementById('c4-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const infoEl = globalThis.document.getElementById('info')!;
const levelButtons = globalThis.document.querySelectorAll<HTMLButtonElement>('.level-btn');

function resize() {
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
resize();
globalThis.addEventListener('resize', resize);

// Prevent VS Code webview from capturing wheel events
globalThis.document.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });

// --- Render loop ---

function resolveEdges(doc: GraphDocument): GraphEdge[] {
  return doc.edges.map(e => {
    if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
      const fromNode = doc.nodes.find(n => n.id === e.from.nodeId);
      const toNode = doc.nodes.find(n => n.id === e.to.nodeId);
      if (fromNode && toNode) {
        const pts = resolveConnectorEndpoints(e, doc.nodes);
        return {
          ...e,
          from: { ...e.from, x: pts.from.x, y: pts.from.y },
          to: { ...e.to, x: pts.to.x, y: pts.to.y },
        };
      }
    }
    return e;
  });
}

function draw() {
  if (!document) {
    requestAnimationFrame(draw);
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = globalThis.devicePixelRatio ?? 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  render({
    ctx,
    width: w,
    height: h,
    nodes: document.nodes,
    edges: resolveEdges(document),
    viewport,
    selection: { nodeIds: selectedNodeIds, edgeIds: [] },
    showGrid: false,
    isDark: true,
  });

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// --- Interactions ---

let isPanning = false;
let lastPan = { x: 0, y: 0 };

function hitTestNode(screenX: number, screenY: number): GraphNode | undefined {
  if (!document) return undefined;
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(viewport, screenX - rect.left, screenY - rect.top);
  // 非フレームノードを優先（上に描画されるため逆順走査）
  for (let i = document.nodes.length - 1; i >= 0; i--) {
    const n = document.nodes[i];
    if (n.type === 'frame') continue;
    if (world.x >= n.x && world.x <= n.x + n.width &&
        world.y >= n.y && world.y <= n.y + n.height) {
      return n;
    }
  }
  return undefined;
}

/** ハイライトをリセットし、元の stroke に戻す */
function clearHighlights(): void {
  if (!document) return;
  for (const node of document.nodes) {
    const original = highlightedNodes.get(node.id);
    if (original !== undefined) {
      node.style.fill = original;
    }
  }
  highlightedNodes = new Map();
}

/** 選択ノードに接続するノードの輪郭色を変更する */
function highlightConnectedNodes(selectedId: string): void {
  if (!document) return;
  const connectedIds = new Set<string>();
  for (const edge of document.edges) {
    if (edge.from.nodeId === selectedId && edge.to.nodeId) {
      connectedIds.add(edge.to.nodeId);
    }
    if (edge.to.nodeId === selectedId && edge.from.nodeId) {
      connectedIds.add(edge.from.nodeId);
    }
  }
  for (const node of document.nodes) {
    if (connectedIds.has(node.id) && node.type !== 'frame') {
      highlightedNodes.set(node.id, node.style.fill);
      node.style.fill = HIGHLIGHT_FILL;
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  clearHighlights();
  const hit = hitTestNode(e.clientX, e.clientY);
  if (hit) {
    selectedNodeIds = [hit.id];
    highlightConnectedNodes(hit.id);
    // c4Id が file:: プレフィックスを持つ場合、ファイルを開く
    const c4Id = hit.metadata?.c4Id;
    if (typeof c4Id === 'string' && c4Id.startsWith('file::')) {
      const relativePath = c4Id.slice('file::'.length);
      vscode.postMessage({ type: 'openFile', relativePath });
    }
  } else {
    selectedNodeIds = [];
    isPanning = true;
    lastPan = { x: e.clientX, y: e.clientY };
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  const dx = e.clientX - lastPan.x;
  const dy = e.clientY - lastPan.y;
  lastPan = { x: e.clientX, y: e.clientY };
  viewport = pan(viewport, dx, dy);
});

canvas.addEventListener('mouseup', () => { isPanning = false; });
canvas.addEventListener('mouseleave', () => { isPanning = false; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  viewport = zoom(viewport, cx, cy, e.deltaY);
}, { passive: false });

// --- Fit ---

function fitContent() {
  if (!document || document.nodes.length === 0) return;
  const nodes = document.nodes;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }
  viewport = fitToContent(canvas.clientWidth, canvas.clientHeight, { minX, minY, maxX, maxY });
}

globalThis.document.getElementById('btn-fit')!.addEventListener('click', fitContent);

// --- Level toggle ---

/**
 * C4 レベルとフレーム深さの対応:
 *   L2 = depth 1 (Container)
 *   L3 = depth 2 (Component)
 *   L4 = 非フレームノード (Code)
 *
 * レベル選択時の動作:
 *   L4: 全ノード表示（フレーム入れ子のまま）
 *   L3: L4 ノードを非表示、L3 フレームを矩形ノードに変換
 *   L2: L3/L4 を非表示、L2 フレームを矩形ノードに変換
 */

function setLevel(level: number) {
  if (!fullDocument) return;
  currentLevel = level;
  const view = buildLevelView(fullDocument, level);
  layoutWithSubgroups(view, 'TB', 180, 60);
  document = view;
  updateLevelButtons();
  requestAnimationFrame(() => fitContent());
}

function updateLevelButtons() {
  levelButtons.forEach(btn => {
    const l = Number.parseInt(btn.dataset.level ?? '0', 10);
    btn.classList.toggle('active', l === currentLevel);
  });
}

levelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const l = Number.parseInt(btn.dataset.level ?? '4', 10);
    setLevel(l);
  });
});

// --- Message handling ---

globalThis.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  if (msg.type === 'loadModel') {
    const model = msg.model as C4Model;
    const boundaries = (msg.boundaries ?? []) as BoundaryInfo[];
    const doc = c4ToGraphDocument(model, boundaries);
    layoutWithSubgroups(doc, 'TB', 180, 60);
    fullDocument = doc;
    currentLevel = 4;
    document = buildLevelView(fullDocument, currentLevel);
    infoEl.textContent = `${doc.nodes.length} nodes | ${doc.edges.length} edges`;
    updateLevelButtons();
    requestAnimationFrame(() => fitContent());
  } else if (msg.type === 'highlightFiles') {
    if (!document) return;
    clearHighlights();
    const paths = msg.relativePaths as string[];
    const pathSet = new Set(paths);
    for (const node of document.nodes) {
      const c4Id = node.metadata?.c4Id;
      if (typeof c4Id === 'string' && c4Id.startsWith('file::')) {
        const relPath = c4Id.slice('file::'.length);
        if (pathSet.has(relPath)) {
          highlightedNodes.set(node.id, node.style.fill);
          node.style.fill = HIGHLIGHT_FILL;
        }
      }
    }
  }
});

// Notify extension that webview is ready
vscode.postMessage({ type: 'ready' });
