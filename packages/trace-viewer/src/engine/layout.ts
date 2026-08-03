import type { GraphNode, GraphEdge, NodeStyle, EdgeStyle } from '@anytime-markdown/graph-core';
import type { CallNode } from '@anytime-markdown/trace-core/parse';
import { extractLifelines, applyFilters } from '@anytime-markdown/trace-core/analyze';
import type { SourceLocation, TraceFile } from '@anytime-markdown/trace-core/types';

export interface LayoutOptions {
    maxDepth?: number;
    hiddenLifelines?: Set<string>;
    isDark?: boolean;
    /** Maximum number of io events to render (default 200). Set to 0 to hide all io events. */
    maxIoEvents?: number;
}

/** GraphEdge extended with trace-specific metadata */
export interface SequenceEdge extends GraphEdge {
    metadata?: Record<string, string | number>;
}

export interface SequenceLayout {
    nodes: GraphNode[];
    edges: SequenceEdge[];
    width: number;
    height: number;
    /** lifelineId → X center coordinate */
    lifelineXMap: Map<string, number>;
}

const MARGIN_LEFT = 40;
const MARGIN_TOP = 10;
const MARGIN_BOTTOM = 60;
const HEADER_WIDTH = 160;
const HEADER_HEIGHT = 40;
const LIFELINE_SPACING = 200;
const STEP_HEIGHT = 36;
const ACTIVATION_WIDTH = 10;
/** ヘッダーボックス底辺と最初のイベント矢印の間に設けるギャップ */
const GAP_AFTER_HEADER = STEP_HEIGHT;

function makeUid() {
    let _counter = 0;
    return (prefix: string): string => `${prefix}-${++_counter}`;
}

function makeStyle(dark: boolean): { node: NodeStyle; lifelineEdge: EdgeStyle; callEdge: EdgeStyle; returnEdge: EdgeStyle } {
    const headerFill = dark ? '#2d3748' : '#e2e8f0';
    const headerStroke = dark ? '#63b3ed' : '#3182ce';
    const lifelineStroke = dark ? '#4a5568' : '#a0aec0';
    const callStroke = dark ? '#63b3ed' : '#2b6cb0';
    const returnStroke = dark ? '#718096' : '#718096';
    const fontColor = dark ? '#e2e8f0' : '#1a202c';

    return {
        node: {
            fill: headerFill,
            stroke: headerStroke,
            strokeWidth: 1,
            fontSize: 12,
            fontFamily: 'monospace',
            fontColor,
        },
        lifelineEdge: {
            stroke: lifelineStroke,
            strokeWidth: 1,
            dashed: true,
        },
        callEdge: {
            stroke: callStroke,
            strokeWidth: 1,
            endShape: 'arrow',
        },
        returnEdge: {
            stroke: returnStroke,
            strokeWidth: 1,
            endShape: 'arrow',
            dashed: true,
        },
    };
}

interface TickState {
    value: number;
}

interface ActivationRecord {
    nodeId: string;
    startTick: number;
    lifelineId: string;
    x: number;
    /** 呼び出しのソース位置（TRC-5 ソースジャンプ先）。trace v1 由来では未設定。 */
    loc?: SourceLocation;
}

export function buildSequenceLayout(
    file: TraceFile,
    callTree: CallNode,
    opts: LayoutOptions = {},
): SequenceLayout {
    const uid = makeUid();
    const isDark = opts.isDark ?? true;
    const styles = makeStyle(isDark);

    // Apply filters if needed
    const filterOpts: Parameters<typeof applyFilters>[1] = {};
    if (opts.maxDepth !== undefined) filterOpts.maxDepth = opts.maxDepth;
    if (opts.hiddenLifelines) filterOpts.hiddenLifelines = opts.hiddenLifelines;
    const filteredTree = (opts.maxDepth !== undefined || opts.hiddenLifelines)
        ? applyFilters(callTree, filterOpts)
        : callTree;

    // Determine active lifelines in order of first appearance
    const activeLifelines = extractLifelines(file);
    const lifelineXMap = new Map<string, number>();
    activeLifelines.forEach((ll, idx) => {
        lifelineXMap.set(ll.id, MARGIN_LEFT + idx * LIFELINE_SPACING + HEADER_WIDTH / 2);
    });

    const nodes: GraphNode[] = [];
    const edges: SequenceEdge[] = [];
    const tick: TickState = { value: 0 };
    const activations: ActivationRecord[] = [];

    // Draw lifeline header nodes
    for (const ll of activeLifelines) {
        const x = lifelineXMap.get(ll.id)!;
        const label = ll.path ?? ll.label ?? ll.id;
        const headerNode: GraphNode = {
            id: uid('header'),
            type: 'rect',
            x: x - HEADER_WIDTH / 2,
            y: MARGIN_TOP,
            width: HEADER_WIDTH,
            height: HEADER_HEIGHT,
            text: label,
            style: { ...styles.node },
            // ファイル lifeline のヘッダはファイル先頭へのジャンプ先を持つ（TRC-5）。
            metadata: {
                role: 'header',
                lifelineId: ll.id,
                ...(ll.kind === 'file' && ll.path ? { sourceFile: ll.path, sourceLine: 1 } : {}),
            },
        };
        nodes.push(headerNode);
    }

    // Walk tree and emit messages
    walkNode(filteredTree, lifelineXMap, styles, nodes, edges, tick, activations, uid);

    // Draw io events (fs / http / sql calls)
    const maxIoEvents = opts.maxIoEvents ?? 200;
    if (maxIoEvents > 0) {
        const ioStroke = isDark ? '#68d391' : '#276749';
        let ioCount = 0;
        for (const ev of file.events) {
            if (ev.type !== 'io') continue;
            if (ioCount >= maxIoEvents) break;
            const fromX = lifelineXMap.get(ev.from) ?? null;
            const toX = lifelineXMap.get(ev.to);
            if (toX === undefined) continue;
            ioCount++;
            const y = MARGIN_TOP + HEADER_HEIGHT + GAP_AFTER_HEADER + tick.value * STEP_HEIGHT;
            tick.value += 1;
            if (fromX !== null) {
                edges.push({
                    id: uid('io'),
                    type: 'line',
                    from: { nodeId: undefined, x: fromX, y },
                    to: { nodeId: undefined, x: toX, y },
                    style: { stroke: ioStroke, strokeWidth: 1, endShape: 'arrow' },
                    label: ev.method,
                    metadata: { role: 'io', method: ev.method },
                });
            }
        }
    }

    const totalHeight = MARGIN_TOP + HEADER_HEIGHT + GAP_AFTER_HEADER + (tick.value + 1) * STEP_HEIGHT + MARGIN_BOTTOM;

    // Draw lifeline vertical lines (dashed)
    for (const ll of activeLifelines) {
        const x = lifelineXMap.get(ll.id)!;
        const topY = MARGIN_TOP + HEADER_HEIGHT;
        const botY = totalHeight - MARGIN_BOTTOM / 2;
        edges.push({
            id: uid('lifeline'),
            type: 'line',
            from: { nodeId: undefined, x, y: topY },
            to: { nodeId: undefined, x, y: botY },
            style: { ...styles.lifelineEdge },
            metadata: { role: 'lifeline', lifelineId: ll.id },
        });
    }

    // Draw activation bars
    for (const act of activations) {
        const x = act.x - ACTIVATION_WIDTH / 2;
        const y1 = MARGIN_TOP + HEADER_HEIGHT + GAP_AFTER_HEADER + act.startTick * STEP_HEIGHT;
        const y2 = MARGIN_TOP + HEADER_HEIGHT + GAP_AFTER_HEADER + tick.value * STEP_HEIGHT;
        if (y2 > y1) {
            nodes.push({
                id: act.nodeId,
                type: 'rect',
                x,
                y: y1,
                width: ACTIVATION_WIDTH,
                height: Math.max(y2 - y1, 10),
                text: '',
                style: {
                    fill: isDark ? '#3182ce' : '#bee3f8',
                    stroke: isDark ? '#63b3ed' : '#2b6cb0',
                    strokeWidth: 1,
                    fontSize: 10,
                    fontFamily: 'sans-serif',
                },
                metadata: {
                    role: 'activation',
                    lifelineId: act.lifelineId,
                    ...(act.loc ? { sourceFile: act.loc.file, sourceLine: act.loc.line } : {}),
                },
            });
        }
    }

    const width = MARGIN_LEFT * 2 + activeLifelines.length * LIFELINE_SPACING;

    return { nodes, edges, width, height: totalHeight, lifelineXMap };
}

function walkNode(
    node: CallNode,
    lifelineXMap: Map<string, number>,
    styles: ReturnType<typeof makeStyle>,
    nodes: GraphNode[],
    edges: SequenceEdge[],
    tick: TickState,
    activations: ActivationRecord[],
    uid: (prefix: string) => string,
): void {
    if (node.eventId === -1) {
        // root: just walk children
        for (const child of node.children) {
            walkNode(child, lifelineXMap, styles, nodes, edges, tick, activations, uid);
        }
        return;
    }

    const fromX = node.fromLifelineId ? (lifelineXMap.get(node.fromLifelineId) ?? null) : null;
    const toX = lifelineXMap.get(node.lifelineId);
    if (toX === undefined) return;

    const callTick = tick.value;
    const y = MARGIN_TOP + HEADER_HEIGHT + GAP_AFTER_HEADER + callTick * STEP_HEIGHT;
    tick.value += 1;

    const actId = uid('act');
    activations.push({
        nodeId: actId,
        startTick: callTick,
        lifelineId: node.lifelineId,
        x: toX,
        ...(node.loc ? { loc: node.loc } : {}),
    });

    const isSelfCall = fromX !== null && Math.abs(fromX - toX) < 1;

    if (isSelfCall) {
        // Self-call: draw a SelfCallChip node instead of arrow
        nodes.push({
            id: uid('selfcall'),
            type: 'rect',
            x: toX + ACTIVATION_WIDTH,
            y: y - 10,
            width: 80,
            height: 20,
            text: node.fn,
            style: {
                fill: styles.node.fill,
                stroke: styles.node.stroke,
                strokeWidth: 1,
                fontSize: 10,
                fontFamily: 'monospace',
                fontColor: styles.node.fontColor,
                borderRadius: 4,
            },
            metadata: {
                role: 'selfcall',
                depth: node.depth,
                ...(node.loc ? { sourceFile: node.loc.file, sourceLine: node.loc.line } : {}),
            },
        });
    } else if (fromX !== null) {
        // Cross-lifeline call arrow
        edges.push({
            id: uid('call'),
            type: 'line',
            from: { nodeId: undefined, x: fromX, y },
            to: { nodeId: undefined, x: toX, y },
            style: { ...styles.callEdge },
            label: node.fn,
            metadata: { role: 'call', depth: node.depth },
        });
    } else {
        // Initial call (no from) - draw an entry arrow from left margin
        edges.push({
            id: uid('entry'),
            type: 'line',
            from: { nodeId: undefined, x: toX - HEADER_WIDTH / 2, y },
            to: { nodeId: undefined, x: toX, y },
            style: { ...styles.callEdge },
            label: node.fn,
            metadata: { role: 'entry', depth: node.depth },
        });
    }

    // Recurse into children
    for (const child of node.children) {
        walkNode(child, lifelineXMap, styles, nodes, edges, tick, activations, uid);
    }

    // Return arrow
    if (!isSelfCall && fromX !== null) {
        const returnY = MARGIN_TOP + HEADER_HEIGHT + GAP_AFTER_HEADER + tick.value * STEP_HEIGHT;
        tick.value += 1;
        edges.push({
            id: uid('return'),
            type: 'line',
            from: { nodeId: undefined, x: toX, y: returnY },
            to: { nodeId: undefined, x: fromX, y: returnY },
            style: { ...styles.returnEdge },
            label: node.ok ? undefined : '↯ ' + (node.error?.message ?? 'error'),
            metadata: { role: 'return', depth: node.depth },
        });
    }
}
