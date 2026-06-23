/**
 * Regression: clicking the maximize (fullscreen) icon must re-render the popup
 * into the maximized layout WITHOUT the consumer calling handle.update().
 *
 * Before the fix, the vanilla port only invoked props.onMaximizedChange and
 * relied on the (vanilla) consumer to re-render — but trailViewer.ts merely
 * mutates a local variable, so applyStyles() never re-ran and the popup never
 * went fullscreen.
 */
import { mountResizablePopup, type ResizablePopupVanillaProps } from '../resizablePopup';
import type { C4ThemeColors } from '../../../../theme/c4Tokens';

function makeColors(): C4ThemeColors {
  return {
    text: '#fff',
    border: '#333',
  } as unknown as C4ThemeColors;
}

function baseProps(
  overrides: Partial<ResizablePopupVanillaProps> = {},
): ResizablePopupVanillaProps {
  return {
    title: 'Messages',
    ariaLabel: 'Messages',
    onClose: () => {},
    isDark: true,
    colors: makeColors(),
    size: null,
    onSizeChange: () => {},
    maximized: false,
    onMaximizedChange: () => {},
    centered: true,
    withBackdrop: true,
    i18nMaximize: 'Maximize',
    i18nRestore: 'Restore',
    i18nClose: 'Close',
    i18nResize: 'Resize',
    mountContent: () => {},
    ...overrides,
  };
}

describe('mountResizablePopup maximize', () => {
  it('switches to fullscreen layout on maximize click without an external update()', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let notified: boolean | null = null;

    const handle = mountResizablePopup(container, baseProps({
      onMaximizedChange: (m) => { notified = m; },
    }));

    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    const maximizeBtn = container.querySelector('button[aria-label="Maximize"]') as HTMLButtonElement;
    expect(root).toBeTruthy();
    expect(maximizeBtn).toBeTruthy();
    // Not maximized initially: no bottom inset.
    expect(root.style.bottom).toBe('');

    maximizeBtn.click();

    // Self-rendered into fullscreen layout (top/left/right/bottom inset).
    expect(root.style.top).toBe('8px');
    expect(root.style.bottom).toBe('8px');
    expect(root.style.left).toBe('8px');
    expect(root.style.right).toBe('8px');
    // Parent is still notified for persistence.
    expect(notified).toBe(true);

    handle.destroy();
    container.remove();
  });

  it('applies the new size immediately during resize without an external update()', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let lastSize: { width: number; height: number } | null = null;

    const handle = mountResizablePopup(container, baseProps({
      size: null,
      centered: false,
      onSizeChange: (s) => { lastSize = s; },
    }));

    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    const resizeHandle = container.querySelector('[role="separator"]') as HTMLElement;
    expect(resizeHandle).toBeTruthy();

    resizeHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
    globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 500 }));

    // Self-rendered: explicit width/height applied to the root, parent notified.
    expect(root.style.width).toMatch(/px$/);
    expect(root.style.height).toMatch(/px$/);
    expect(lastSize).not.toBeNull();
    expect(lastSize!.width).toBeGreaterThanOrEqual(360);
    expect(lastSize!.height).toBeGreaterThanOrEqual(240);

    globalThis.dispatchEvent(new MouseEvent('mouseup'));
    handle.destroy();
    container.remove();
  });

  it('ignores resize start while maximized', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let sizeChanged = false;

    const handle = mountResizablePopup(container, baseProps({
      maximized: true,
      onSizeChange: () => { sizeChanged = true; },
    }));

    const resizeHandle = container.querySelector('[role="separator"]') as HTMLElement;
    resizeHandle.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
    globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 500 }));

    expect(sizeChanged).toBe(false);

    globalThis.dispatchEvent(new MouseEvent('mouseup'));
    handle.destroy();
    container.remove();
  });

  it('restores from fullscreen on a second click', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountResizablePopup(container, baseProps({ maximized: false }));
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    const maximizeBtn = container.querySelector('button[aria-label="Maximize"]') as HTMLButtonElement;

    maximizeBtn.click();
    expect(root.style.bottom).toBe('8px');

    // After maximizing, the button now exposes the restore label.
    const restoreBtn = container.querySelector('button[aria-label="Restore"]') as HTMLButtonElement;
    expect(restoreBtn).toBeTruthy();
    restoreBtn.click();
    expect(root.style.bottom).toBe('');

    handle.destroy();
    container.remove();
  });

  it('keeps toolbar icon buttons inheriting the themed color (currentColor)', () => {
    // Regression: the size override used `el.style.cssText = '...'` (assignment,
    // not `+=`), wiping createIconButton's base styles — including
    // `color:inherit`. The SVG icons use `fill:currentColor`, so without
    // inherit they fell back to the UA <button> color and no longer matched the
    // popup title (colors.text). Both icons must keep inheriting the theme color.
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountResizablePopup(container, baseProps());

    const maximizeBtn = container.querySelector('button[aria-label="Maximize"]') as HTMLButtonElement;
    const closeBtn = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    expect(maximizeBtn).toBeTruthy();
    expect(closeBtn).toBeTruthy();

    // Base styles from createIconButton must survive the size override.
    expect(maximizeBtn.style.color).toBe('inherit');
    expect(closeBtn.style.color).toBe('inherit');
    expect(maximizeBtn.style.background).toBe('transparent');
    expect(closeBtn.style.background).toBe('transparent');
    // Size override still applied.
    expect(maximizeBtn.style.width).toBe('22px');
    expect(closeBtn.style.width).toBe('22px');

    handle.destroy();
    container.remove();
  });
});
