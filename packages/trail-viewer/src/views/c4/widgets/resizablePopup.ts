/**
 * ResizablePopup — vanilla DOM view.
 * Thin port of c4/components/widgets/ResizablePopup.tsx.
 */
import { createIconButton } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { C4ThemeColors } from '../../../theme/c4Tokens';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const MARGIN = 8;
const HANDLE_SIZE = 16;

export interface ResizablePopupSize {
  readonly width: number;
  readonly height: number;
}

// SVG paths for icons (inline — avoids extra dependencies)
const FULLSCREEN_PATH =
  'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';
const FULLSCREEN_EXIT_PATH =
  'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z';
const CLOSE_PATH =
  'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

function svgIcon(path: string, size: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.cssText = `width:${size}px;height:${size}px;fill:currentColor;display:block;`;
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

export interface ResizablePopupVanillaProps {
  readonly title: string;
  readonly ariaLabel: string;
  readonly onClose: () => void;
  readonly isDark: boolean;
  readonly colors: C4ThemeColors;
  readonly size: ResizablePopupSize | null;
  readonly onSizeChange: (size: ResizablePopupSize) => void;
  readonly maximized: boolean;
  readonly onMaximizedChange: (maximized: boolean) => void;
  readonly defaultLeft?: number;
  readonly defaultMaxWidth?: number;
  readonly centered?: boolean;
  readonly withBackdrop?: boolean;
  readonly i18nMaximize: string;
  readonly i18nRestore: string;
  readonly i18nClose: string;
  readonly i18nResize: string;
  /** Callback to mount content into the popup body. */
  readonly mountContent: (container: HTMLElement) => VanillaViewHandle<unknown> | void;
}

export function mountResizablePopup(
  container: HTMLElement,
  initial: ResizablePopupVanillaProps,
): VanillaViewHandle<ResizablePopupVanillaProps> {
  let props = initial;

  // Live render state. The popup self-renders on maximize/resize so it works
  // regardless of whether the consumer re-feeds props via update() (vanilla
  // consumers mutate a local variable and never call update()). Synced from
  // props on update() so controlled (React) consumers keep working.
  let liveMaximized = props.maximized;
  let liveSize = props.size;

  // --- Backdrop ---
  const backdrop = document.createElement('div');
  backdrop.setAttribute('aria-hidden', 'true');

  // --- Root dialog ---
  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');

  // --- Toolbar ---
  const toolbar = document.createElement('div');

  const titleEl = document.createElement('span');

  const toolbarBtns = document.createElement('div');
  toolbarBtns.style.cssText = 'display:flex;gap:4px;';

  const maximizeBtn = createIconButton({
    size: 'small',
    onClick: () => {
      liveMaximized = !liveMaximized;
      applyStyles();
      props.onMaximizedChange(liveMaximized);
    },
  });
  maximizeBtn.el.style.cssText = 'width:22px;height:22px;min-width:22px;';

  const closeBtn = createIconButton({
    size: 'small',
    onClick: () => props.onClose(),
  });
  closeBtn.el.style.cssText = 'width:22px;height:22px;min-width:22px;';

  toolbarBtns.appendChild(maximizeBtn.el);
  toolbarBtns.appendChild(closeBtn.el);

  toolbar.appendChild(titleEl);
  toolbar.appendChild(toolbarBtns);
  root.appendChild(toolbar);

  // --- Body ---
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;';
  root.appendChild(body);

  // Mount content
  let contentHandle: VanillaViewHandle<unknown> | void = props.mountContent(body);

  // --- Resize handle ---
  const handle = document.createElement('div');
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.style.cssText =
    `position:absolute;right:0;bottom:0;width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;` +
    'cursor:nwse-resize;opacity:0.5;';

  root.appendChild(handle);

  container.appendChild(backdrop);
  container.appendChild(root);

  function applyStyles(): void {
    const { colors, isDark, defaultLeft = 244, defaultMaxWidth = 960, centered = false, withBackdrop = false } = props;
    const maximized = liveMaximized;
    const size = liveSize;

    // Backdrop
    backdrop.style.cssText = withBackdrop
      ? `position:absolute;inset:0;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);` +
        `background:${isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)'};z-index:10;`
      : 'display:none;';

    // Base
    root.style.cssText =
      'position:absolute;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;z-index:11;' +
      `border:1px solid ${colors.border};` +
      `background:${isDark ? 'rgba(18,18,18,0.96)' : 'rgba(251,249,243,0.98)'};` +
      `color:${colors.text};` +
      'box-shadow:0 8px 24px rgba(0,0,0,0.28);';
    root.setAttribute('aria-label', props.ariaLabel);

    // Size
    let sizeCss = '';
    if (maximized) {
      sizeCss = `top:${MARGIN}px;left:${MARGIN}px;right:${MARGIN}px;bottom:${MARGIN}px;`;
    } else if (size) {
      if (centered) {
        sizeCss =
          `top:${MARGIN}px;left:${MARGIN}px;right:${MARGIN}px;` +
          `margin-left:auto;margin-right:auto;width:${size.width}px;height:${size.height}px;`;
      } else {
        sizeCss =
          `top:${MARGIN}px;left:${defaultLeft}px;width:${size.width}px;height:${size.height}px;`;
      }
    } else if (centered) {
      sizeCss =
        `top:${MARGIN}px;left:${MARGIN}px;right:${MARGIN}px;` +
        `margin-left:auto;margin-right:auto;max-width:${defaultMaxWidth}px;` +
        `height:calc(100% - ${MARGIN * 2}px);`;
    } else {
      sizeCss =
        `top:${MARGIN}px;left:${defaultLeft}px;right:${MARGIN}px;` +
        `max-width:${defaultMaxWidth}px;height:calc(100% - ${MARGIN * 2}px);`;
    }
    root.style.cssText += sizeCss;

    // Toolbar
    toolbar.style.cssText =
      `display:flex;align-items:center;justify-content:space-between;` +
      `padding:6px 12px;border-bottom:1px solid ${colors.border};flex-shrink:0;`;
    titleEl.style.cssText =
      `color:${colors.text};font-size:0.8rem;font-weight:600;`;
    titleEl.textContent = props.title;

    // Maximize icon & labels
    const isMax = maximized;
    maximizeBtn.el.setAttribute('aria-label', isMax ? props.i18nRestore : props.i18nMaximize);
    maximizeBtn.el.title = isMax ? props.i18nRestore : props.i18nMaximize;
    maximizeBtn.el.replaceChildren(svgIcon(isMax ? FULLSCREEN_EXIT_PATH : FULLSCREEN_PATH, 14));

    closeBtn.el.setAttribute('aria-label', props.i18nClose);
    closeBtn.el.title = props.i18nClose;
    closeBtn.el.replaceChildren(svgIcon(CLOSE_PATH, 14));

    // Resize handle
    handle.setAttribute('aria-label', props.i18nResize);
    handle.style.display = maximized ? 'none' : '';
  }

  // --- Resize mouse events ---
  let resizeMoveHandler: ((e: MouseEvent) => void) | null = null;
  let resizeUpHandler: (() => void) | null = null;

  function onResizeMouseDown(e: MouseEvent): void {
    // Resize is meaningless while maximized (handle is also hidden then); guard
    // so a stray drag cannot leave a stale liveSize behind.
    if (liveMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = root.getBoundingClientRect();
    const parent = root.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const offsetLeft = parentRect ? rect.left - parentRect.left : 0;
    const offsetTop = parentRect ? rect.top - parentRect.top : 0;
    const parentW = parent?.clientWidth ?? globalThis.innerWidth;
    const parentH = parent?.clientHeight ?? globalThis.innerHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const maxW = Math.max(MIN_WIDTH, parentW - offsetLeft - MARGIN);
    const maxH = Math.max(MIN_HEIGHT, parentH - offsetTop - MARGIN);

    resizeMoveHandler = (ev: MouseEvent) => {
      const w = Math.max(MIN_WIDTH, Math.min(maxW, startW + (ev.clientX - startX)));
      const h = Math.max(MIN_HEIGHT, Math.min(maxH, startH + (ev.clientY - startY)));
      liveSize = { width: w, height: h };
      applyStyles();
      props.onSizeChange(liveSize);
    };
    resizeUpHandler = () => {
      if (resizeMoveHandler) globalThis.removeEventListener('mousemove', resizeMoveHandler);
      if (resizeUpHandler) globalThis.removeEventListener('mouseup', resizeUpHandler);
      resizeMoveHandler = null;
      resizeUpHandler = null;
    };
    globalThis.addEventListener('mousemove', resizeMoveHandler);
    globalThis.addEventListener('mouseup', resizeUpHandler);
  }

  handle.addEventListener('mousedown', onResizeMouseDown);

  applyStyles();

  return {
    update(next) {
      props = next;
      // Sync live render state from props so controlled (React) consumers that
      // re-feed maximized/size on every render stay authoritative.
      liveMaximized = next.maximized;
      liveSize = next.size;
      applyStyles();
    },
    destroy() {
      if (resizeMoveHandler) globalThis.removeEventListener('mousemove', resizeMoveHandler);
      if (resizeUpHandler) globalThis.removeEventListener('mouseup', resizeUpHandler);
      handle.removeEventListener('mousedown', onResizeMouseDown);
      if (contentHandle && typeof (contentHandle as VanillaViewHandle<unknown>).destroy === 'function') {
        (contentHandle as VanillaViewHandle<unknown>).destroy();
        contentHandle = undefined;
      }
      maximizeBtn.destroy();
      closeBtn.destroy();
      backdrop.remove();
      root.remove();
    },
  };
}

/**
 * Extended handle returned by mountResizablePopupShell that exposes contentEl
 * so React wrappers can portal children into the popup body.
 */
export interface ResizablePopupShellHandle extends VanillaViewHandle<Omit<ResizablePopupVanillaProps, 'mountContent'>> {
  readonly contentEl: HTMLElement;
}

/**
 * Like mountResizablePopup but for React wrappers:
 * does NOT call mountContent — instead exposes contentEl for React portal.
 */
export function mountResizablePopupShell(
  container: HTMLElement,
  initial: Omit<ResizablePopupVanillaProps, 'mountContent'>,
): ResizablePopupShellHandle {
  let capturedBody!: HTMLElement;
  const innerHandle = mountResizablePopup(container, {
    ...initial,
    // mountContent is called synchronously during mountResizablePopup construction.
    mountContent: (el) => { capturedBody = el; },
  });
  return {
    update: (next) => innerHandle.update({ ...next, mountContent: (el) => { capturedBody = el; } }),
    destroy: () => innerHandle.destroy(),
    get contentEl() { return capturedBody; },
  };
}
