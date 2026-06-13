import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasBase } from '@anytime-markdown/graph-react-islands';
import { engine } from '@anytime-markdown/graph-core';
import type { GraphNode, Viewport, SelectionState } from '@anytime-markdown/graph-core';
import type { SequenceLayout } from '../engine/layout';
import type { SourceLocation } from '@anytime-markdown/trace-core/types';

export interface SequenceCanvasProps {
    readonly layout: SequenceLayout;
    readonly isDark: boolean;
    readonly width: number;
    readonly height: number;
    onNodeClick?: (node: GraphNode | null) => void;
    onJumpToSource?: (loc: SourceLocation) => void;
}

export function SequenceCanvas({
    layout,
    isDark,
    width,
    height,
    onNodeClick,
    onJumpToSource,
}: Readonly<SequenceCanvasProps>) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [viewport, setViewport] = useState<Viewport>({ offsetX: 0, offsetY: 0, scale: 1 });
    const [selection, setSelection] = useState<SelectionState>({ nodeIds: [], edgeIds: [] });

    const getViewport = useCallback(() => viewport, [viewport]);
    const getNodes = useCallback(() => layout.nodes, [layout.nodes]);

    const { handleMouseDown, handleMouseMove, handleMouseUp } = useCanvasBase({
        canvasRef,
        getViewport,
        getNodes,
        setViewport,
        setSelection,
        onNodeClick,
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        engine.render({
            ctx,
            width,
            height,
            nodes: layout.nodes,
            edges: layout.edges,
            viewport,
            selection,
            showGrid: false,
            isDark,
        });
    }, [layout, viewport, selection, isDark, width, height]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ display: 'block', cursor: 'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        />
    );
}
