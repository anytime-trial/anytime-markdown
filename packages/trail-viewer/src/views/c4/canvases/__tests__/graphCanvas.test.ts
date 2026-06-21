/**
 * graphCanvas.ts — vanilla mount factory tests.
 *
 * Runs in jsdom (jest.config.js testEnvironment: "jsdom").
 * Does NOT assert pixel output; only wiring, DOM creation, and interaction
 * semantics.
 */

import type { GraphDocument, Viewport } from '@anytime-markdown/graph-core';
import type { Action } from '@anytime-markdown/graph-core/state';
import { mountGraphCanvas } from '../graphCanvas';
import type { GraphCanvasViewProps } from '../graphCanvas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViewport(): Viewport {
  return { offsetX: 0, offsetY: 0, scale: 1 };
}

function makeDocument(): GraphDocument {
  return {
    nodes: [
      {
        id: 'n1',
        x: 10,
        y: 10,
        width: 100,
        height: 60,
        label: 'Node 1',
        type: 'box',
        metadata: { c4Id: 'c4-n1' },
      },
    ],
    edges: [],
    groups: [],
    viewport: makeViewport(),
  } as unknown as GraphDocument;
}

function makeProps(overrides: Partial<GraphCanvasViewProps> = {}): GraphCanvasViewProps {
  return {
    document: makeDocument(),
    viewport: makeViewport(),
    dispatch: jest.fn() as unknown as (action: Action) => void,
    isDark: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic mount
// ---------------------------------------------------------------------------

describe('mountGraphCanvas', () => {
  it('creates a <canvas> element inside the container', () => {
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps());
    const cvs = container.querySelector('canvas');
    expect(cvs).not.toBeNull();
    expect(cvs?.tagName).toBe('CANVAS');
    handle.destroy();
  });

  it('canvas has tabIndex=0 and aria attributes', () => {
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps());
    const cvs = container.querySelector('canvas')!;
    expect(cvs.tabIndex).toBe(0);
    expect(cvs.getAttribute('role')).toBe('img');
    expect(cvs.getAttribute('aria-roledescription')).toBe('architecture diagram');
    handle.destroy();
  });

  it('does not throw when canvas.getContext returns null (jsdom)', () => {
    const container = document.createElement('div');
    // jsdom getContext('2d') may return null — factory must not crash
    expect(() => {
      const handle = mountGraphCanvas(container, makeProps());
      handle.destroy();
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // onCanvasReady callback
  // ---------------------------------------------------------------------------

  it('calls onCanvasReady with the canvas element', () => {
    const container = document.createElement('div');
    const onCanvasReady = jest.fn();
    const handle = mountGraphCanvas(container, makeProps({ onCanvasReady }));
    expect(onCanvasReady).toHaveBeenCalledTimes(1);
    expect(onCanvasReady.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
    handle.destroy();
  });

  it('writes into canvasRef.current on mount', () => {
    const container = document.createElement('div');
    const canvasRef = { current: null as HTMLCanvasElement | null };
    const handle = mountGraphCanvas(container, makeProps({ canvasRef }));
    expect(canvasRef.current).toBeInstanceOf(HTMLCanvasElement);
    handle.destroy();
  });

  it('clears canvasRef.current on destroy', () => {
    const container = document.createElement('div');
    const canvasRef = { current: null as HTMLCanvasElement | null };
    const handle = mountGraphCanvas(container, makeProps({ canvasRef }));
    handle.destroy();
    expect(canvasRef.current).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps());
    expect(() => handle.update(makeProps({ isDark: true }))).not.toThrow();
    handle.destroy();
  });

  // ---------------------------------------------------------------------------
  // destroy
  // ---------------------------------------------------------------------------

  it('destroy removes the canvas element from the container', () => {
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps());
    handle.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('double destroy does not throw', () => {
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps());
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Listener wiring — simulate events
  // ---------------------------------------------------------------------------

  it('mousedown on empty area triggers dispatch(SET_SELECTION) with empty selection', () => {
    const dispatch = jest.fn();
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps({ dispatch }));
    const cvs = container.querySelector('canvas')!;

    cvs.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 500 }));

    // After mousedown in empty area (no hit), selection cleared via dispatch
    const setSelectionCalls = (dispatch as jest.Mock).mock.calls.filter(
      ([a]: [{ type: string }]) => a.type === 'SET_SELECTION',
    );
    expect(setSelectionCalls.length).toBeGreaterThanOrEqual(1);

    handle.destroy();
  });

  it('mousedown → mousemove → mouseup pan sequence calls SET_VIEWPORT dispatch without throwing', () => {
    const dispatch = jest.fn();
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps({ dispatch }));
    const cvs = container.querySelector('canvas')!;

    // Middle-button drag = pan
    cvs.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, clientX: 100, clientY: 100 }));
    cvs.dispatchEvent(new MouseEvent('mousemove', { button: 1, bubbles: true, clientX: 120, clientY: 110 }));
    cvs.dispatchEvent(new MouseEvent('mouseup', { button: 1, bubbles: true }));

    const viewportCalls = (dispatch as jest.Mock).mock.calls.filter(
      ([a]: [{ type: string }]) => a.type === 'SET_VIEWPORT',
    );
    expect(viewportCalls.length).toBeGreaterThanOrEqual(1);

    handle.destroy();
  });

  it('keydown ArrowUp dispatches SET_VIEWPORT pan without error', () => {
    const dispatch = jest.fn();
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps({ dispatch }));
    const cvs = container.querySelector('canvas')!;

    cvs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    const viewportCalls = (dispatch as jest.Mock).mock.calls.filter(
      ([a]: [{ type: string }]) => a.type === 'SET_VIEWPORT',
    );
    expect(viewportCalls.length).toBeGreaterThanOrEqual(1);

    handle.destroy();
  });

  it('contextmenu event calls preventDefault and does not throw', () => {
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps());
    const cvs = container.querySelector('canvas')!;

    const evt = new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 });
    const preventSpy = jest.spyOn(evt, 'preventDefault');
    expect(() => cvs.dispatchEvent(evt)).not.toThrow();
    expect(preventSpy).toHaveBeenCalled();

    handle.destroy();
  });

  it('after destroy, events no longer trigger dispatch', () => {
    const dispatch = jest.fn();
    const container = document.createElement('div');
    const handle = mountGraphCanvas(container, makeProps({ dispatch }));
    const cvs = container.querySelector('canvas')!;
    handle.destroy();

    (dispatch as jest.Mock).mockClear();
    // Canvas is removed, so events won't reach it — but we verify dispatch is not called
    cvs.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect((dispatch as jest.Mock).mock.calls.length).toBe(0);
  });
});
