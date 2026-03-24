import { graphReducer, createInitialState } from '../../state/reducer';
import { createNode, createEdge, createDocument } from '../../types';
import type { GraphState, Action } from '../../state/reducer';

function makeState(): GraphState {
  const doc = createDocument('Test');
  const node1 = createNode('rect', 10, 20, { id: 'n1', text: 'A' });
  const node2 = createNode('rect', 200, 100, { id: 'n2', text: 'B' });
  doc.nodes = [node1, node2];
  return createInitialState(doc);
}

describe('graphReducer', () => {
  it('creates initial state with empty document', () => {
    const state = createInitialState();
    expect(state.document.name).toBe('Untitled');
    expect(state.document.nodes).toHaveLength(0);
    expect(state.selection.nodeIds).toHaveLength(0);
    expect(state.historyIndex).toBe(0);
  });

  it('ADD_NODE adds node and selects it', () => {
    const state = createInitialState();
    const node = createNode('rect', 50, 50, { id: 'test-node' });
    const next = graphReducer(state, { type: 'ADD_NODE', node });
    expect(next.document.nodes).toHaveLength(1);
    expect(next.selection.nodeIds).toEqual(['test-node']);
  });

  it('DELETE_SELECTED removes selected nodes and connected edges', () => {
    const state = makeState();
    const edge = createEdge('arrow', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
    let s = graphReducer(state, { type: 'ADD_EDGE', edge });
    s = graphReducer(s, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    s = graphReducer(s, { type: 'DELETE_SELECTED' });
    expect(s.document.nodes.find(n => n.id === 'n1')).toBeUndefined();
    expect(s.document.edges.find(e => e.id === 'e1')).toBeUndefined();
    expect(s.document.nodes.find(n => n.id === 'n2')).toBeDefined();
  });

  it('MOVE_NODES adjusts position', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'MOVE_NODES', ids: ['n1'], dx: 5, dy: 10 });
    const moved = next.document.nodes.find(n => n.id === 'n1')!;
    expect(moved.x).toBe(15);
    expect(moved.y).toBe(30);
  });

  it('UNDO restores previous state', () => {
    const state = makeState();
    const node = createNode('rect', 300, 300, { id: 'n3' });
    let s = graphReducer(state, { type: 'ADD_NODE', node });
    expect(s.document.nodes).toHaveLength(3);

    s = graphReducer(s, { type: 'UNDO' });
    expect(s.document.nodes).toHaveLength(2);
  });

  it('REDO advances history index', () => {
    const state = makeState();
    const node = createNode('rect', 300, 300, { id: 'n3' });
    let s = graphReducer(state, { type: 'ADD_NODE', node });
    s = graphReducer(s, { type: 'UNDO' });
    const prevIdx = s.historyIndex;
    s = graphReducer(s, { type: 'REDO' });
    expect(s.historyIndex).toBe(prevIdx + 1);
  });

  it('UNDO at beginning does nothing', () => {
    const state = createInitialState();
    const next = graphReducer(state, { type: 'UNDO' });
    expect(next).toBe(state);
  });

  it('BRING_TO_FRONT / SEND_TO_BACK reorders nodes', () => {
    const state = makeState();
    const s = graphReducer(state, { type: 'BRING_TO_FRONT', nodeIds: ['n1'] });
    expect(s.document.nodes[s.document.nodes.length - 1].id).toBe('n1');

    const s2 = graphReducer(s, { type: 'SEND_TO_BACK', nodeIds: ['n1'] });
    expect(s2.document.nodes[0].id).toBe('n1');
  });

  it('SELECT_ALL selects all nodes', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'SELECT_ALL' });
    expect(next.selection.nodeIds).toEqual(['n1', 'n2']);
  });
});
