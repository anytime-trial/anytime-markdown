import { createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Mount a React component as an island inside vanilla DOM (vanilla→React bridge).
 *
 * Used when the vanilla trailViewer shell needs to host React components that
 * cannot be trivially ported (TraceViewer, PromptManager).
 */
export function mountReactIsland<P extends object>(
  container: HTMLElement,
  Component: ComponentType<P>,
  initialProps: P,
): { update(props: P): void; destroy(): void } {
  const host = document.createElement('div');
  host.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;flex:1;min-height:0;';
  container.appendChild(host);
  const root: Root = createRoot(host);
  root.render(createElement(Component, initialProps));
  return {
    update(props: P) {
      root.render(createElement(Component, props));
    },
    destroy() {
      root.unmount();
      host.remove();
    },
  };
}
