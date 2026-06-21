/**
 * TabSkeleton の vanilla 版（`components/shared/TabSkeleton.tsx` の素 DOM 等価）。
 *
 * タイトル行 + 3 段のコンテンツプレースホルダーを素 DOM で描画する。
 * height props をサポートする。
 */
import { createSkeleton } from '@anytime-markdown/ui-core';

export interface TabSkeletonProps {
  height?: string | number;
}

/** TabSkeleton を container へマウントし、root 要素を返す（{el} パターン）。 */
export function mountTabSkeleton(
  container: HTMLElement,
  props: TabSkeletonProps = {},
): { el: HTMLElement } {
  const height = props.height ?? '70vh';
  const root = document.createElement('div');
  root.style.cssText = `padding:16px;height:${typeof height === 'number' ? `${height}px` : height};`;

  // Title
  const { el: title } = createSkeleton({
    variant: 'text',
    style: { width: '40%', marginBottom: '16px' },
  });
  root.appendChild(title);

  // Three content blocks
  const blocks: Array<{ height: string }> = [
    { height: '120px' },
    { height: '300px' },
    { height: '200px' },
  ];
  for (const b of blocks) {
    const { el } = createSkeleton({
      variant: 'rectangular',
      style: { width: '100%', height: b.height, marginBottom: '16px' },
    });
    root.appendChild(el);
  }

  container.appendChild(root);
  return { el: root };
}
