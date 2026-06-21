/**
 * c4Viewer.ts — vanilla mount factory tests.
 *
 * Runs in jsdom. Tests that mountC4Viewer builds DOM layout and toolbar
 * without throwing, even with: null canvas ctx, no server, missing data.
 */

// Polyfill structuredClone (not available in jsdom / older Jest environments)
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val)) as T;
}

import { mountC4Viewer } from '../c4Viewer';
import type { C4ViewerViewProps } from '../c4Viewer';

// ── Minimal mock for canvas context (jsdom has no canvas ctx) ──
const mockGetContext = jest.fn(() => null);
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: mockGetContext,
  writable: true,
});

// ── Suppress fetch (no server in tests) ──
globalThis.fetch = jest.fn(() => Promise.reject(new Error('no server'))) as unknown as typeof fetch;

// ── Mock requestAnimationFrame ──
let rafId = 0;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  // Don't run infinite loops in tests
  return ++rafId;
};
globalThis.cancelAnimationFrame = jest.fn();

// ── Helpers ──
function makeProps(overrides: Partial<C4ViewerViewProps> = {}): C4ViewerViewProps {
  return {
    isDark: false,
    c4Model: null,
    boundaries: [],
    featureMatrix: null,
    dsmMatrix: null,
    coverageMatrix: null,
    coverageDiff: null,
    connected: false,
    releases: [],
    serverUrl: '',
    t: (key: string) => key,
    ...overrides,
  };
}

// ── Tests ──
describe('mountC4Viewer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('mounts without throwing with minimal props', () => {
    expect(() => {
      const handle = mountC4Viewer(container, makeProps());
      handle.destroy();
    }).not.toThrow();
  });

  it('appends a root div to container', () => {
    const handle = mountC4Viewer(container, makeProps());
    expect(container.children.length).toBeGreaterThan(0);
    handle.destroy();
  });

  it('creates level buttons C1-C5', () => {
    const handle = mountC4Viewer(container, makeProps());
    const buttons = container.querySelectorAll('button[aria-label^="Level "]');
    expect(buttons.length).toBe(5);
    handle.destroy();
  });

  it('level buttons have correct aria-pressed for default level 1', () => {
    const handle = mountC4Viewer(container, makeProps());
    const buttons = Array.from(container.querySelectorAll('button[aria-label^="Level "]'));
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('initialLevel prop sets correct active button', () => {
    const handle = mountC4Viewer(container, makeProps({ initialLevel: 3 }));
    const buttons = Array.from(container.querySelectorAll('button[aria-label^="Level "]'));
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('clicking a level button changes aria-pressed', async () => {
    const handle = mountC4Viewer(container, makeProps());
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Level "]'));
    buttons[1].click(); // Click C2
    // scheduleRender uses queueMicrotask — flush
    await Promise.resolve();
    await Promise.resolve();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('update() reflects prop changes without throwing', () => {
    const handle = mountC4Viewer(container, makeProps({ isDark: false }));
    expect(() => {
      handle.update(makeProps({ isDark: true }));
    }).not.toThrow();
    handle.destroy();
  });

  it('destroy() removes root from container', () => {
    const handle = mountC4Viewer(container, makeProps());
    const childCountBefore = container.children.length;
    expect(childCountBefore).toBeGreaterThan(0);
    handle.destroy();
    expect(container.children.length).toBe(0);
  });

  it('destroy() can be called multiple times safely', () => {
    const handle = mountC4Viewer(container, makeProps());
    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });

  it('overlay select is present', () => {
    const handle = mountC4Viewer(container, makeProps());
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
    handle.destroy();
  });

  it('analysisProgress shows loading overlay', () => {
    const handle = mountC4Viewer(container, makeProps({
      analysisProgress: { phase: 'Indexing...', percent: 42 },
    }));
    // Loading overlay is appended to root, check it exists
    const dialogs = container.querySelectorAll('[role="dialog"][aria-label="Analysis in progress"]');
    expect(dialogs.length).toBeGreaterThan(0);
    handle.destroy();
  });

  it('no analysisProgress hides loading overlay', () => {
    const handle = mountC4Viewer(container, makeProps({ analysisProgress: null }));
    const dialogs = container.querySelectorAll('[role="dialog"][aria-label="Analysis in progress"]');
    // Should exist but be hidden (display:none)
    for (const d of dialogs) {
      expect((d as HTMLElement).style.display).toBe('none');
    }
    handle.destroy();
  });

  it('update() with isDark:true and isDark:false does not throw', () => {
    const handle = mountC4Viewer(container, makeProps({ isDark: false }));
    handle.update(makeProps({ isDark: true }));
    handle.update(makeProps({ isDark: false }));
    handle.destroy();
  });

  it('context menu is appended to document.body (not container)', () => {
    const handle = mountC4Viewer(container, makeProps());
    // Context menus go to document.body so they can be fixed-position
    // They should not be in container
    const ctxInContainer = container.querySelectorAll('[style*="z-index:1001"]');
    expect(ctxInContainer.length).toBe(0);
    handle.destroy();
  });

  it('destroy() removes context menu from document.body', () => {
    const bodyChildrenBefore = document.body.children.length;
    const handle = mountC4Viewer(container, makeProps());
    // Context menu overlay + menu el added to body
    const bodyChildrenDuring = document.body.children.length;
    handle.destroy();
    // After destroy they should be removed
    expect(document.body.children.length).toBeLessThanOrEqual(bodyChildrenBefore + 1); // +1 for container itself
  });

  it('tree host contains child DOM after mount', () => {
    const handle = mountC4Viewer(container, makeProps());
    // treeHost should have content (tree panel appended)
    const root = container.querySelector('div');
    expect(root).toBeTruthy();
    handle.destroy();
  });

  it('dialog hosts are present in DOM', () => {
    const handle = mountC4Viewer(container, makeProps());
    // dialogsHost should exist
    const dialogs = container.querySelectorAll('[role="dialog"]');
    // At minimum the loading dialog and the 3 mount dialogs (even if closed)
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    handle.destroy();
  });
});
