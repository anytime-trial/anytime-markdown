/**
 * minimapCanvas.ts — vanilla mount factory tests.
 *
 * Runs in jsdom (jest.config.js testEnvironment: "jsdom").
 * Does NOT assert pixel output; tests wiring, DOM creation, and interaction
 * semantics only. ctx is null in jsdom — all drawing paths are guarded.
 */

import type { GraphNode, Viewport } from '@anytime-markdown/graph-core/types';
import { mountMinimapCanvas } from '../minimapCanvas';
import type { MinimapCanvasViewProps } from '../minimapCanvas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViewport(): Viewport {
  return { offsetX: 0, offsetY: 0, scale: 1 };
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n1',
    x: 10,
    y: 10,
    width: 100,
    height: 60,
    label: 'Node 1',
    type: 'box',
    style: { fill: '#4a90d9', stroke: '#2c5f8a' },
    metadata: { c4Id: 'c4-n1' },
    ...overrides,
  } as unknown as GraphNode;
}

function makeMainCanvas(clientWidth = 800, clientHeight = 600): HTMLCanvasElement {
  const c = document.createElement('canvas');
  // jsdom clientWidth/clientHeight are 0 by default; override with defineProperty
  Object.defineProperty(c, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(c, 'clientHeight', { value: clientHeight, configurable: true });
  return c;
}

function makeProps(overrides: Partial<MinimapCanvasViewProps> = {}): MinimapCanvasViewProps {
  return {
    nodes: [makeNode()],
    viewport: makeViewport(),
    mainCanvasRef: { current: makeMainCanvas() },
    onViewportChange: jest.fn(),
    isDark: false,
    width: 200,
    height: 130,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic mount
// ---------------------------------------------------------------------------

describe('mountMinimapCanvas', () => {
  it('creates a wrapper div and a <canvas> inside container', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps());

    const wrapper = container.querySelector('div');
    expect(wrapper).not.toBeNull();
    const cvs = wrapper?.querySelector('canvas');
    expect(cvs).not.toBeNull();
    expect(cvs?.tagName).toBe('CANVAS');

    handle.destroy();
  });

  it('creates zoom-in, zoom-out, and (when onFit provided) fit buttons', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps({ onFit: jest.fn() }));

    const zoomIn = container.querySelector('[aria-label="Zoom in"]');
    const zoomOut = container.querySelector('[aria-label="Zoom out"]');
    const fit = container.querySelector('[aria-label="Fit"]');
    expect(zoomIn).not.toBeNull();
    expect(zoomOut).not.toBeNull();
    expect(fit).not.toBeNull();

    handle.destroy();
  });

  it('hides fit button when onFit is not provided', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps({ onFit: undefined }));

    const fit = container.querySelector('[aria-label="Fit"]') as HTMLElement | null;
    // button exists but is hidden via display:none
    expect(fit?.style.display).toBe('none');

    handle.destroy();
  });

  it('does not throw when canvas.getContext returns null (jsdom)', () => {
    const container = document.createElement('div');
    expect(() => {
      const handle = mountMinimapCanvas(container, makeProps());
      handle.destroy();
    }).not.toThrow();
  });

  it('wrapper has aria-label on canvas for accessibility', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps());
    const cvs = container.querySelector('canvas');
    expect(cvs?.getAttribute('aria-label')).toBeTruthy();
    handle.destroy();
  });

  // ── Interaction: viewport drag on minimap invokes onViewportChange ──
  it('mousedown (in viewport rect) + mousemove invokes onViewportChange for viewport drag', () => {
    const onViewportChange = jest.fn();
    const container = document.createElement('div');
    // Use a highly zoomed-in viewport so the viewport rect is small in minimap coords.
    // scale=10 means the viewport rect in world is tiny → in minimap it's also tiny.
    const zoomedViewport = { offsetX: 0, offsetY: 0, scale: 10 };
    const handle = mountMinimapCanvas(
      container,
      makeProps({ onViewportChange, viewport: zoomedViewport }),
    );
    const cvs = container.querySelector('canvas')!;

    // With scale=10, main canvas 800×600 maps to 80×60 world units.
    // screenToWorld({scale:10, offsetX:0, offsetY:0}, 0, 0) = (0,0) → minimap (2.5, 0)
    // screenToWorld(vp, 800, 600) = (80, 60)  → minimap (80*1.625+2.5, 60*1.625) = (132.5, 97.5)
    // So viewport rect spans ~(2.5,0)–(132.5,97.5) in minimap coords.
    // Click inside that region at (50, 50) to start a viewport drag.
    cvs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50, clientY: 50 }));
    // Move 10px → triggers onViewportChange from handleMouseMove
    cvs.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 60 }));

    expect(onViewportChange).toHaveBeenCalled();

    handle.destroy();
  });

  it('mousedown → mousemove → mouseup sequence does not throw', () => {
    const onViewportChange = jest.fn();
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(
      container,
      makeProps({ onViewportChange }),
    );
    const cvs = container.querySelector('canvas')!;

    expect(() => {
      cvs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
      cvs.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 20 }));
      cvs.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 30 }));
      cvs.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 30, clientY: 30 }));
    }).not.toThrow();

    handle.destroy();
  });

  it('mouseleave resets drag state without throwing', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps());
    const cvs = container.querySelector('canvas')!;

    expect(() => {
      cvs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }));
      cvs.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }).not.toThrow();

    handle.destroy();
  });

  // ── Zoom buttons ──
  it('zoom-in button click calls onViewportChange', () => {
    const onViewportChange = jest.fn();
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(
      container,
      makeProps({ onViewportChange }),
    );
    const btnIn = container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;
    btnIn.click();
    expect(onViewportChange).toHaveBeenCalled();
    handle.destroy();
  });

  it('zoom-out button click calls onViewportChange', () => {
    const onViewportChange = jest.fn();
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(
      container,
      makeProps({ onViewportChange }),
    );
    const btnOut = container.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement;
    btnOut.click();
    expect(onViewportChange).toHaveBeenCalled();
    handle.destroy();
  });

  it('fit button click calls onFit callback', () => {
    const onFit = jest.fn();
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps({ onFit }));
    const btnFit = container.querySelector('[aria-label="Fit"]') as HTMLButtonElement;
    btnFit.click();
    expect(onFit).toHaveBeenCalled();
    handle.destroy();
  });

  // ── update ──
  it('update() does not throw and reflects new props', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps());

    const newOnViewportChange = jest.fn();
    expect(() => {
      handle.update(makeProps({ onViewportChange: newOnViewportChange, isDark: true, width: 150, height: 100 }));
    }).not.toThrow();

    // After update, new onViewportChange should be wired on next interaction.
    // Use zoom buttons (unconditional path) to verify closure update.
    const btnIn = container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;
    btnIn.click();
    expect(newOnViewportChange).toHaveBeenCalled();

    handle.destroy();
  });

  // ── destroy ──
  it('destroy() removes the wrapper from the container', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps());
    expect(container.children.length).toBe(1);

    handle.destroy();
    expect(container.children.length).toBe(0);
  });

  it('destroy() is idempotent (calling twice does not throw)', () => {
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps());
    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });

  it('after destroy, events on canvas no longer invoke onViewportChange', () => {
    const onViewportChange = jest.fn();
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(container, makeProps({ onViewportChange }));
    const cvs = container.querySelector('canvas')!;

    handle.destroy();
    (onViewportChange as jest.Mock).mockClear();

    // Canvas removed from DOM — events won't bubble through listeners
    cvs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    cvs.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect((onViewportChange as jest.Mock).mock.calls.length).toBe(0);
  });

  // ── Edge cases ──
  it('handles empty nodes array without throwing', () => {
    const container = document.createElement('div');
    expect(() => {
      const handle = mountMinimapCanvas(container, makeProps({ nodes: [] }));
      handle.destroy();
    }).not.toThrow();
  });

  it('handles null mainCanvasRef.current without throwing on mouseup', () => {
    const onViewportChange = jest.fn();
    const container = document.createElement('div');
    const handle = mountMinimapCanvas(
      container,
      makeProps({ mainCanvasRef: { current: null }, onViewportChange }),
    );
    const cvs = container.querySelector('canvas')!;

    expect(() => {
      cvs.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }));
      cvs.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 5, clientY: 5 }));
    }).not.toThrow();

    handle.destroy();
  });
});
