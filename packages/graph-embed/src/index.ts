import { AnytimeGraphElement } from './AnytimeGraphElement';

export type { GraphInput, GraphInputNode, GraphInputEdge, GraphInputNodeType, NodeClickDetail } from './types';
export { AnytimeGraphElement };

if (typeof customElements !== 'undefined' && !customElements.get('anytime-graph')) {
  customElements.define('anytime-graph', AnytimeGraphElement);
}
