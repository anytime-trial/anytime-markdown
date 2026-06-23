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
});
