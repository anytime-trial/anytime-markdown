import type { GraphDocument, Viewport, GraphNode, GraphEdge } from '@anytime-markdown/graph-core';
import { engine, layoutWithSubgroups } from '@anytime-markdown/graph-core';
import { c4ToGraphDocument } from '@anytime-markdown/c4kernel';
import type { C4Model, BoundaryInfo } from '@anytime-markdown/c4kernel';

const { render, pan, zoom, fitToContent } = engine;

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// --- State ---

let document: GraphDocument | null = null;
let viewport: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
let currentLevel = 4;

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
        return {
          ...e,
          type: 'line' as const,
          from: { ...e.from, x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
          to: { ...e.to, x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 },
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
    selection: { nodeIds: [], edgeIds: [] },
    showGrid: false,
    isDark: true,
  });

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// --- Interactions ---

let isPanning = false;
let lastPan = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
  isPanning = true;
  lastPan = { x: e.clientX, y: e.clientY };
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
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  viewport = zoom(viewport, cx, cy, factor);
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

function setLevel(level: number) {
  if (!document) return;
  currentLevel = level;
  const frames = document.nodes.filter(n => n.type === 'frame');
  for (const frame of frames) {
    let depth = 1;
    let parentId = frame.groupId;
    while (parentId) {
      depth++;
      const parent = document.nodes.find(n => n.id === parentId);
      parentId = parent?.groupId;
    }
    frame.collapsed = depth >= level;
  }
  updateLevelButtons();
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
    document = doc;
    infoEl.textContent = `${doc.nodes.length} nodes | ${doc.edges.length} edges`;
    currentLevel = 4;
    updateLevelButtons();
    // Auto-fit after layout
    requestAnimationFrame(() => fitContent());
  }
});

// Notify extension that webview is ready
vscode.postMessage({ type: 'ready' });
