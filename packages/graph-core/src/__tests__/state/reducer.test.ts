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
    const edge = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
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

  it('BRING_TO_FRONT / SEND_TO_BACK sets zIndex', () => {
    const state = makeState();
    const s = graphReducer(state, { type: 'BRING_TO_FRONT', nodeIds: ['n1'] });
    const n1 = s.document.nodes.find(n => n.id === 'n1')!;
    const n2 = s.document.nodes.find(n => n.id === 'n2')!;
    expect(n1.zIndex).toBeGreaterThan(n2.zIndex ?? 0);

    const s2 = graphReducer(s, { type: 'SEND_TO_BACK', nodeIds: ['n1'] });
    const n1b = s2.document.nodes.find(n => n.id === 'n1')!;
    const n2b = s2.document.nodes.find(n => n.id === 'n2')!;
    expect(n1b.zIndex).toBeLessThan(n2b.zIndex ?? 0);
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

    // ADD_NODE: stores AFTER-state (nodes=[sel-node], selection=['sel-node'])
    const node = createNode('rect', 50, 50, { id: 'sel-node' });
    const afterAdd = graphReducer(state, { type: 'ADD_NODE', node });
    expect(afterAdd.selection.nodeIds).toEqual(['sel-node']);

    // UNDO: restores history[0] = initial state, selection=[]
    const afterUndo = graphReducer(afterAdd, { type: 'UNDO' });
    expect(afterUndo.document.nodes).toHaveLength(0);
    expect(afterUndo.selection.nodeIds).toEqual([]);
  });

  it('should restore selection across multiple undo steps', () => {
    const state = makeState(); // nodes=[n1,n2], selection=[]

    // Select n1, then update it
    let s = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    s = graphReducer(s, { type: 'UPDATE_NODE', id: 'n1', changes: { text: 'Updated' } });
    expect(s.selection.nodeIds).toEqual(['n1']); // UPDATE_NODE doesn't change selection

    // Select n2, then update it
    s = graphReducer(s, { type: 'SET_SELECTION', selection: { nodeIds: ['n2'], edgeIds: [] } });
    s = graphReducer(s, { type: 'UPDATE_NODE', id: 'n2', changes: { text: 'Updated B' } });
    expect(s.selection.nodeIds).toEqual(['n2']);

    // UNDO: restores AFTER-state of first UPDATE_NODE → selection=['n1']
    s = graphReducer(s, { type: 'UNDO' });
    expect(s.selection.nodeIds).toEqual(['n1']);

    // UNDO again: restores history[0] (initial state) → selection=[]
    s = graphReducer(s, { type: 'UNDO' });
    expect(s.selection.nodeIds).toEqual([]);
  });

  it('DELETE_SELECTED skips locked nodes but deletes unlocked ones', () => {
    const state = makeState();
    // Lock n1
    let s = graphReducer(state, { type: 'UPDATE_NODE', id: 'n1', changes: { locked: true } });
    // Add an edge from n1 to n2
    const edge = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
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
    const edge = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
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

  it('UPDATE_NODE updates node properties', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'UPDATE_NODE', id: 'n1', changes: { text: 'Updated' } });
    expect(next.document.nodes.find(n => n.id === 'n1')!.text).toBe('Updated');
    // Other node untouched
    expect(next.document.nodes.find(n => n.id === 'n2')!.text).toBe('B');
  });

  it('UPDATE_EDGE updates edge properties', () => {
    const state = makeState();
    const edge = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
    let s = graphReducer(state, { type: 'ADD_EDGE', edge });
    s = graphReducer(s, { type: 'UPDATE_EDGE', id: 'e1', changes: { label: 'Edge Label' } });
    expect(s.document.edges.find(e => e.id === 'e1')!.label).toBe('Edge Label');
  });

  it('RESIZE_NODE changes node dimensions and position', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'RESIZE_NODE', id: 'n1', x: 50, y: 60, width: 200, height: 150 });
    const node = next.document.nodes.find(n => n.id === 'n1')!;
    expect(node.x).toBe(50);
    expect(node.y).toBe(60);
    expect(node.width).toBe(200);
    expect(node.height).toBe(150);
  });

  it('SET_NODE_POSITIONS updates multiple node positions in a single action', () => {
    const state = makeState();
    const next = graphReducer(state, {
      type: 'SET_NODE_POSITIONS',
      updates: [
        { id: 'n1', x: 100, y: 200 },
        { id: 'n2', x: 300, y: 400 },
      ],
    });
    const n1 = next.document.nodes.find(n => n.id === 'n1')!;
    const n2 = next.document.nodes.find(n => n.id === 'n2')!;
    expect(n1.x).toBe(100);
    expect(n1.y).toBe(200);
    expect(n2.x).toBe(300);
    expect(n2.y).toBe(400);
    // width/height は変更されない
    expect(n1.width).toBe(state.document.nodes[0].width);
    expect(n2.height).toBe(state.document.nodes[1].height);
    // 履歴は記録しない
    expect(next.historyIndex).toBe(state.historyIndex);
  });

  it('SNAPSHOT creates a history entry without modifying document', () => {
    const state = makeState();
    const before = state.historyIndex;
    const next = graphReducer(state, { type: 'SNAPSHOT' });
    expect(next.historyIndex).toBe(before + 1);
    expect(next.history.length).toBe(state.history.length + 1);
    // Document unchanged
    expect(next.document.nodes).toEqual(state.document.nodes);
  });

  it('PASTE_NODES adds nodes and edges with selection updated', () => {
    const state = makeState();
    const pasteNode1 = createNode('rect', 300, 300, { id: 'p1', text: 'Pasted1' });
    const pasteNode2 = createNode('rect', 400, 400, { id: 'p2', text: 'Pasted2' });
    const pasteEdge = createEdge('connector', { nodeId: 'p1', x: 0, y: 0 }, { nodeId: 'p2', x: 0, y: 0 }, { id: 'pe1' });
    const next = graphReducer(state, { type: 'PASTE_NODES', nodes: [pasteNode1, pasteNode2], edges: [pasteEdge] });
    expect(next.document.nodes).toHaveLength(4); // 2 original + 2 pasted
    expect(next.document.edges).toHaveLength(1);
    expect(next.selection.nodeIds).toEqual(['p1', 'p2']);
  });

  it('ALIGN_NODES updates node positions', () => {
    const state = makeState();
    const next = graphReducer(state, {
      type: 'ALIGN_NODES',
      updates: [
        { id: 'n1', x: 100 },
        { id: 'n2', x: 100 },
      ],
    });
    expect(next.document.nodes.find(n => n.id === 'n1')!.x).toBe(100);
    expect(next.document.nodes.find(n => n.id === 'n2')!.x).toBe(100);
    // y should remain unchanged
    expect(next.document.nodes.find(n => n.id === 'n1')!.y).toBe(20);
    expect(next.document.nodes.find(n => n.id === 'n2')!.y).toBe(100);
  });

  it('CREATE_GROUP creates a group with selected memberIds', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    expect(state.document.groups).toHaveLength(1);
    expect(state.document.groups![0].memberIds).toEqual(['n1', 'n2']);
  });

  it('DELETE_GROUP removes the group', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = state.document.groups![0].id;
    state = graphReducer(state, { type: 'DELETE_GROUP', id: groupId });
    expect(state.document.groups).toHaveLength(0);
    expect(state.document.nodes).toHaveLength(2);
  });

  it('SET_DOCUMENT replaces the entire document', () => {
    const state = makeState();
    const newDoc = createDocument('New Doc');
    const newNode = createNode('ellipse', 0, 0, { id: 'new1', text: 'New' });
    newDoc.nodes = [newNode];
    const next = graphReducer(state, { type: 'SET_DOCUMENT', doc: newDoc });
    expect(next.document.name).toBe('New Doc');
    expect(next.document.nodes).toHaveLength(1);
    expect(next.document.nodes[0].id).toBe('new1');
    expect(next.selection.nodeIds).toEqual([]);
    expect(next.historyIndex).toBe(0);
  });

  it('SET_VIEWPORT updates viewport', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'SET_VIEWPORT', viewport: { offsetX: 100, offsetY: 200, scale: 2 } });
    expect(next.document.viewport.offsetX).toBe(100);
    expect(next.document.viewport.offsetY).toBe(200);
    expect(next.document.viewport.scale).toBe(2);
  });

  it('should restore selection on REDO', () => {
    const state = createInitialState();

    // ADD_NODE(r1): stores AFTER-state → selection=['r1']
    const node1 = createNode('rect', 10, 10, { id: 'r1' });
    let s = graphReducer(state, { type: 'ADD_NODE', node: node1 });

    // ADD_NODE(r2): stores AFTER-state → selection=['r2']
    const node2 = createNode('rect', 100, 100, { id: 'r2' });
    s = graphReducer(s, { type: 'ADD_NODE', node: node2 });

    // UNDO twice to go back to initial
    s = graphReducer(s, { type: 'UNDO' });
    s = graphReducer(s, { type: 'UNDO' });
    expect(s.selection.nodeIds).toEqual([]);

    // REDO: restores AFTER-state of first ADD_NODE → selection=['r1']
    s = graphReducer(s, { type: 'REDO' });
    expect(s.selection.nodeIds).toEqual(['r1']);

    // REDO again: restores AFTER-state of second ADD_NODE → selection=['r2']
    s = graphReducer(s, { type: 'REDO' });
    expect(s.selection.nodeIds).toEqual(['r2']);
  });
});
