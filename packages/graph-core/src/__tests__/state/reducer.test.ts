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

  it('should restore selection from history on UNDO', () => {
    // Initial state has empty selection
    const state = createInitialState();
    expect(state.selection.nodeIds).toEqual([]);

    // ADD_NODE: pushHistory saves selection=[] (before), then sets selection=['sel-node']
    const node = createNode('rect', 50, 50, { id: 'sel-node' });
    const afterAdd = graphReducer(state, { type: 'ADD_NODE', node });
    expect(afterAdd.selection.nodeIds).toEqual(['sel-node']);

    // UNDO: restores history entry at index 0 which has selection=[] (initial)
    const afterUndo = graphReducer(afterAdd, { type: 'UNDO' });
    expect(afterUndo.document.nodes).toHaveLength(0);
    expect(afterUndo.selection.nodeIds).toEqual([]);
  });

  it('should restore selection across multiple undo steps', () => {
    const state = makeState(); // nodes=[n1,n2], selection=[]

    // Select n1, then update it (pushHistory saves selection=['n1'])
    let s = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    s = graphReducer(s, { type: 'UPDATE_NODE', id: 'n1', changes: { text: 'Updated' } });
    expect(s.selection.nodeIds).toEqual(['n1']); // UPDATE_NODE doesn't change selection

    // Select n2, then update it (pushHistory saves selection=['n1'] — current at that point)
    s = graphReducer(s, { type: 'SET_SELECTION', selection: { nodeIds: ['n2'], edgeIds: [] } });
    s = graphReducer(s, { type: 'UPDATE_NODE', id: 'n2', changes: { text: 'Updated B' } });
    expect(s.selection.nodeIds).toEqual(['n2']);

    // UNDO: goes to historyIndex-1, which is the entry saved by the first UPDATE_NODE
    // That entry captured selection=['n1'] (the selection at the time of first UPDATE_NODE)
    s = graphReducer(s, { type: 'UNDO' });
    expect(s.selection.nodeIds).toEqual(['n1']);

    // UNDO again: goes to historyIndex-1 (initial entry), which has selection=[]
    s = graphReducer(s, { type: 'UNDO' });
    expect(s.selection.nodeIds).toEqual([]);
  });

  it('DELETE_SELECTED skips locked nodes but deletes unlocked ones', () => {
    const state = makeState();
    // Lock n1
    let s = graphReducer(state, { type: 'UPDATE_NODE', id: 'n1', changes: { locked: true } });
    // Add an edge from n1 to n2
    const edge = createEdge('arrow', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
    s = graphReducer(s, { type: 'ADD_EDGE', edge });
    // Select both nodes
    s = graphReducer(s, { type: 'SET_SELECTION', selection: { nodeIds: ['n1', 'n2'], edgeIds: [] } });
    s = graphReducer(s, { type: 'DELETE_SELECTED' });
    // n1 should survive (locked), n2 should be deleted
    expect(s.document.nodes.find(n => n.id === 'n1')).toBeDefined();
    expect(s.document.nodes.find(n => n.id === 'n2')).toBeUndefined();
    // Edge connected to deleted n2 should also be removed
    expect(s.document.edges.find(e => e.id === 'e1')).toBeUndefined();
  });

  it('DELETE_SELECTED preserves edges connected only to locked nodes', () => {
    const doc = createDocument('Test');
    const node1 = createNode('rect', 10, 20, { id: 'n1', text: 'A' });
    const node2 = createNode('rect', 200, 100, { id: 'n2', text: 'B' });
    const node3 = createNode('rect', 400, 100, { id: 'n3', text: 'C' });
    doc.nodes = [node1, node2, node3];
    let s = createInitialState(doc);
    // Lock n1 and n2
    s = graphReducer(s, { type: 'UPDATE_NODE', id: 'n1', changes: { locked: true } });
    s = graphReducer(s, { type: 'UPDATE_NODE', id: 'n2', changes: { locked: true } });
    // Edge between two locked nodes
    const edge = createEdge('arrow', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
    s = graphReducer(s, { type: 'ADD_EDGE', edge });
    // Select all and delete
    s = graphReducer(s, { type: 'SET_SELECTION', selection: { nodeIds: ['n1', 'n2', 'n3'], edgeIds: [] } });
    s = graphReducer(s, { type: 'DELETE_SELECTED' });
    // Locked nodes survive
    expect(s.document.nodes).toHaveLength(2);
    // Edge between locked nodes survives
    expect(s.document.edges.find(e => e.id === 'e1')).toBeDefined();
    // n3 deleted
    expect(s.document.nodes.find(n => n.id === 'n3')).toBeUndefined();
  });

  it('should restore selection on REDO', () => {
    const state = createInitialState();

    // ADD_NODE(r1): pushHistory saves selection=[], then sets selection=['r1']
    const node1 = createNode('rect', 10, 10, { id: 'r1' });
    let s = graphReducer(state, { type: 'ADD_NODE', node: node1 });

    // ADD_NODE(r2): pushHistory saves selection=['r1'], then sets selection=['r2']
    const node2 = createNode('rect', 100, 100, { id: 'r2' });
    s = graphReducer(s, { type: 'ADD_NODE', node: node2 });

    // UNDO twice to go back to initial
    s = graphReducer(s, { type: 'UNDO' });
    s = graphReducer(s, { type: 'UNDO' });
    expect(s.selection.nodeIds).toEqual([]);

    // REDO: restores entry with selection=[] (saved before first ADD_NODE)
    s = graphReducer(s, { type: 'REDO' });
    expect(s.selection.nodeIds).toEqual([]);

    // REDO again: restores entry with selection=['r1'] (saved before second ADD_NODE)
    s = graphReducer(s, { type: 'REDO' });
    expect(s.selection.nodeIds).toEqual(['r1']);
  });
});
