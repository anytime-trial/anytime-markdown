/**
 * C4PanelSkeleton の vanilla 版（`components/shared/C4PanelSkeleton.tsx` の素 DOM 等価）。
 *
 * ツールバー行 + フレックスボディ（左: flex:1 / 右: 300px 詳細ペイン）のプレースホルダーを素 DOM で描画する。
 */
import { createSkeleton } from '@anytime-markdown/ui-core';

/** C4PanelSkeleton を container へマウントし、root 要素を返す（{el} パターン）。 */
export function mountC4PanelSkeleton(container: HTMLElement): { el: HTMLElement } {
  const root = document.createElement('div');
  root.style.cssText = 'padding:16px;display:flex;flex-direction:column;height:70vh;';

  // Toolbar row
  const { el: toolbar } = createSkeleton({
    variant: 'rectangular',
    style: { width: '100%', height: '48px', marginBottom: '16px' },
  });
  root.appendChild(toolbar);

  // Body (flex row: main canvas + side panel)
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;display:flex;gap:16px;';

  const { el: main } = createSkeleton({ variant: 'rectangular', style: { flex: '1' } });
  const { el: side } = createSkeleton({ variant: 'rectangular', style: { width: '300px' } });
  body.append(main, side);
  root.appendChild(body);

  container.appendChild(root);
  return { el: root };
}
