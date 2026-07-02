/**
 * TraceTree の vanilla DOM 版（`components/messages/TraceTree.tsx` の素 DOM 等価）。
 *
 * メッセージツリーをフラット化して MessageNode を並べる。
 * --am-color-* CSS 変数でテーマに追従し、React / MUI に依存しない。
 */
import type { TrailTreeNode } from '../../domain/parser/types';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountMessageNode } from './messageNode';
import { applyThinScrollbar } from '../../theme/thinScrollbar';

export interface TraceTreeProps {
  t: (key: string) => string;
  nodes: readonly TrailTreeNode[];
}

/** ツリーノードとその全子孫をフラット配列にする。 */
function flattenNode(node: TrailTreeNode): readonly TrailTreeNode[] {
  const result: TrailTreeNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenNode(child));
  }
  return result;
}

interface NodeHandle {
  handle: VanillaViewHandle<Parameters<typeof mountMessageNode>[1]>;
  wrapper: HTMLDivElement;
}

export function mountTraceTree(
  container: HTMLElement,
  initial: TraceTreeProps,
): VanillaViewHandle<TraceTreeProps> {
  const root = document.createElement('div');
  root.style.cssText =
    'display:flex;flex-direction:column;height:100%;overflow:auto;padding:8px;';
  applyThinScrollbar(root);

  let handles: NodeHandle[] = [];

  const render = (props: TraceTreeProps): void => {
    // Destroy old handles
    for (const { handle } of handles) handle.destroy();
    handles = [];
    root.replaceChildren();

    if (props.nodes.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:16px;text-align:center;color:var(--am-color-text-secondary);';
      empty.textContent = props.t('message.noMessages');
      root.appendChild(empty);
      return;
    }

    for (const rootNode of props.nodes) {
      const flat = flattenNode(rootNode);
      for (const n of flat) {
        const wrapper = document.createElement('div');
        const handle = mountMessageNode(wrapper, {
          t: props.t,
          message: n.message,
          depth: n.depth,
        });
        handles.push({ handle, wrapper });
        root.appendChild(wrapper);
      }
    }
  };

  render(initial);
  container.appendChild(root);

  return {
    update(next) {
      render(next);
    },
    destroy() {
      for (const { handle } of handles) handle.destroy();
      handles = [];
      root.remove();
    },
  };
}
