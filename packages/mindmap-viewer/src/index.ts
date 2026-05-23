import { MindmapViewerElement } from './MindmapViewerElement';

export type { GraphInput, GraphInputNode, GraphInputEdge, GraphInputNodeType, NodeClickDetail } from './types';
export { MindmapViewerElement };

if (typeof customElements !== 'undefined' && !customElements.get('mindmap-viewer')) {
  customElements.define('mindmap-viewer', MindmapViewerElement);
}
