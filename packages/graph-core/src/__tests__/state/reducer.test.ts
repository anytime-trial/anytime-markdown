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

  it('REDO at end of history does nothing', () => {
    const state = createInitialState();
    const node = createNode('rect', 50, 50, { id: 'r1' });
    const s = graphReducer(state, { type: 'ADD_NODE', node });
    // At end of history — REDO should be a no-op
    const next = graphReducer(s, { type: 'REDO' });
    expect(next).toBe(s);
  });

  it('history is capped at MAX_HISTORY (50) and oldest entry is dropped', () => {
    let state = createInitialState();
    // Push 51 mutations so the history wraps
    for (let i = 0; i < 51; i++) {
      const node = createNode('rect', i * 10, 0, { id: `n${i}` });
      state = graphReducer(state, { type: 'ADD_NODE', node });
    }
    // History length must be capped
    expect(state.history.length).toBeLessThanOrEqual(50);
    // historyIndex must equal history.length - 1
    expect(state.historyIndex).toBe(state.history.length - 1);
  });

  it('UNDO/REDO entries without groups field fall back to empty array', () => {
    // Create a state whose history entry has no groups field (simulating old data)
    const state = createInitialState();
    const node = createNode('rect', 0, 0, { id: 'n1' });
    let s = graphReducer(state, { type: 'ADD_NODE', node });
    // Manually strip groups from the history entry to simulate missing field
    (s.history[0] as unknown as Record<string, unknown>)['groups'] = undefined;
    // UNDO should not throw and groups should default to []
    const undone = graphReducer(s, { type: 'UNDO' });
    expect(undone.document.groups).toEqual([]);
  });

  it('UNDO/REDO entries without selection field fall back to empty selection', () => {
    const state = createInitialState();
    const node = createNode('rect', 0, 0, { id: 'n1' });
    let s = graphReducer(state, { type: 'ADD_NODE', node });
    // Strip selection from history entry
    (s.history[0] as unknown as Record<string, unknown>)['selection'] = undefined;
    const undone = graphReducer(s, { type: 'UNDO' });
    expect(undone.selection.nodeIds).toEqual([]);
    expect(undone.selection.edgeIds).toEqual([]);
  });

  it('GROUP_SELECTED with fewer than 2 selected nodes returns same state', () => {
    const state = makeState();
    const s = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    const next = graphReducer(s, { type: 'GROUP_SELECTED' });
    expect(next).toBe(s);
  });

  it('GROUP_SELECTED with 2+ nodes creates group', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1', 'n2'], edgeIds: [] } });
    const next = graphReducer(state, { type: 'GROUP_SELECTED', groupId: 'g1' });
    expect(next.document.groups).toHaveLength(1);
    expect(next.document.groups![0].id).toBe('g1');
    expect(next.document.groups![0].memberIds).toEqual(['n1', 'n2']);
  });

  it('CREATE_GROUP with fewer than 2 memberIds returns same state', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1'] });
    expect(next).toBe(state);
  });

  it('CREATE_GROUP with label sets group label', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'], label: 'MyGroup' });
    expect(next.document.groups![0].label).toBe('MyGroup');
  });

  it('ADD_TO_GROUP skips node if already a member', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = state.document.groups![0].id;
    // n1 is already in the group — ADD_TO_GROUP should not duplicate it
    const next = graphReducer(state, { type: 'ADD_TO_GROUP', groupId, nodeId: 'n1' });
    expect(next.document.groups![0].memberIds).toEqual(['n1', 'n2']);
  });

  it('REMOVE_FROM_GROUP removes group when fewer than 2 members remain', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = state.document.groups![0].id;
    // Removing n1 leaves only n2 — group should be dissolved
    const next = graphReducer(state, { type: 'REMOVE_FROM_GROUP', groupId, nodeId: 'n1' });
    expect(next.document.groups).toHaveLength(0);
  });

  it('REMOVE_FROM_GROUP for non-matching groupId keeps group intact', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const next = graphReducer(state, { type: 'REMOVE_FROM_GROUP', groupId: 'nonexistent', nodeId: 'n1' });
    // Group should still be intact
    expect(next.document.groups).toHaveLength(1);
    expect(next.document.groups![0].memberIds).toEqual(['n1', 'n2']);
  });

  it('UNGROUP_SELECTED removes groups that contain any selected node', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    state = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    const next = graphReducer(state, { type: 'UNGROUP_SELECTED' });
    expect(next.document.groups).toHaveLength(0);
  });

  it('UPDATE_GROUP_LABEL updates the label of the specified group', () => {
    let state = makeState();
    state = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = state.document.groups![0].id;
    const next = graphReducer(state, { type: 'UPDATE_GROUP_LABEL', id: groupId, label: 'Updated Label' });
    expect(next.document.groups![0].label).toBe('Updated Label');
  });

  it('DELETE_SELECTED also removes selected edges by edgeId', () => {
    let state = makeState();
    const edge = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
    state = graphReducer(state, { type: 'ADD_EDGE', edge });
    // Select only the edge (not the nodes)
    state = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: ['e1'] } });
    const next = graphReducer(state, { type: 'DELETE_SELECTED' });
    expect(next.document.edges).toHaveLength(0);
    // Nodes should survive
    expect(next.document.nodes).toHaveLength(2);
  });

  it('SET_DOCUMENT with doc missing groups — makeInitialEntry falls back to [] for history (line 70)', () => {
    // Create doc without groups field — exercises makeInitialEntry's groups ?? [] branch
    // The document itself retains undefined, but the history entry normalizes to []
    const doc = createDocument('NoGroups');
    (doc as unknown as Record<string, unknown>)['groups'] = undefined;
    const state = createInitialState();
    const next = graphReducer(state, { type: 'SET_DOCUMENT', doc: doc as never });
    // history[0].groups should be [] (via makeInitialEntry's ?? [] fallback)
    expect(next.history[0].groups).toEqual([]);
  });

  it('withHistory when document.groups is undefined falls back to [] (line 57)', () => {
    // SNAPSHOT calls withHistory(state, state), so if state.document.groups is undefined,
    // withHistory sees after.document.groups === undefined → groups ?? [] branch fires
    let state = makeState();
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const next = graphReducer(state, { type: 'SNAPSHOT' });
    // History entry should have groups = [] (via ?? [] fallback in withHistory)
    expect(next.history[next.historyIndex].groups).toEqual([]);
  });

  it('DELETE_SELECTED with edge having undefined nodeId covers ?? empty string (lines 134-135)', () => {
    // Edge with no nodeId in from/to — exercises e.from.nodeId ?? '' branch
    const state = makeState();
    // Add a floating edge (no nodeId)
    const floatEdge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'float1' });
    let s = graphReducer(state, { type: 'ADD_EDGE', edge: floatEdge });
    // Select n1 for deletion — the floating edge should not crash
    s = graphReducer(s, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    const next = graphReducer(s, { type: 'DELETE_SELECTED' });
    // n1 removed, floating edge preserved (nodeId undefined, ?? '' is '')
    expect(next.document.nodes).toHaveLength(1);
    expect(next.document.edges.some(e => e.id === 'float1')).toBe(true);
  });

  it('SET_NODE_POSITIONS false branch: node without update is returned unchanged (line 201)', () => {
    // SET_NODE_POSITIONS with only n1 in updates — n2 should hit the `: n` false branch
    const state = makeState();
    const next = graphReducer(state, {
      type: 'SET_NODE_POSITIONS',
      updates: [{ id: 'n1', x: 999, y: 888 }],
    });
    // n1 moved, n2 unchanged (false branch of `u ? ... : n`)
    expect(next.document.nodes.find(n => n.id === 'n1')!.x).toBe(999);
    expect(next.document.nodes.find(n => n.id === 'n2')!.x).toBe(200);
  });

  it('ALIGN_NODES with undefined x/y covers ternary empty-object branches (line 326)', () => {
    // update with no x or y — covers `u.x === undefined ? {} : { x: u.x }` true branches
    const state = makeState();
    const next = graphReducer(state, {
      type: 'ALIGN_NODES',
      updates: [
        { id: 'n1', y: 500 }, // x undefined → {} for x, { y: 500 } for y
        { id: 'n2', x: 300 }, // y undefined → { x: 300 } for x, {} for y
      ],
    });
    expect(next.document.nodes.find(n => n.id === 'n1')!.y).toBe(500);
    expect(next.document.nodes.find(n => n.id === 'n1')!.x).toBe(10); // unchanged
    expect(next.document.nodes.find(n => n.id === 'n2')!.x).toBe(300);
    expect(next.document.nodes.find(n => n.id === 'n2')!.y).toBe(100); // unchanged
  });

  it('ALIGN_NODES with node not in updates returns node unchanged (line 325)', () => {
    // Only update n1; n2 is not in updates → `if (!u) return n` fires for n2
    const state = makeState();
    const next = graphReducer(state, {
      type: 'ALIGN_NODES',
      updates: [{ id: 'n1', x: 999, y: 888 }],
    });
    expect(next.document.nodes.find(n => n.id === 'n1')!.x).toBe(999);
    // n2 unchanged — !u branch fires
    expect(next.document.nodes.find(n => n.id === 'n2')!.x).toBe(200);
  });

  it('REDO with entry missing groups/selection covers fallback branches (lines 397-399)', () => {
    const state = makeState();
    const node = createNode('rect', 0, 0, { id: 'rx1' });
    let s = graphReducer(state, { type: 'ADD_NODE', node });
    // UNDO so historyIndex goes back, then modify entry[1] to strip groups/selection
    s = graphReducer(s, { type: 'UNDO' });
    // Strip groups and selection from history entry index 1
    (s.history[1] as unknown as Record<string, unknown>)['groups'] = undefined;
    (s.history[1] as unknown as Record<string, unknown>)['selection'] = undefined;
    const redone = graphReducer(s, { type: 'REDO' });
    // Should not throw; groups and selection default
    expect(redone.document.groups).toEqual([]);
    expect(redone.selection.nodeIds).toEqual([]);
  });

  it('UPDATE_EDGE false branch: non-matching edge is returned unchanged (line 157)', () => {
    // Add two edges, update only e1; e2 should hit the `: e` false branch
    let state = makeState();
    const e1 = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e1' });
    const e2 = createEdge('connector', { nodeId: 'n1', x: 0, y: 0 }, { nodeId: 'n2', x: 0, y: 0 }, { id: 'e2' });
    state = graphReducer(state, { type: 'ADD_EDGE', edge: e1 });
    state = graphReducer(state, { type: 'ADD_EDGE', edge: e2 });
    const next = graphReducer(state, { type: 'UPDATE_EDGE', id: 'e1', changes: { label: 'Updated' } });
    // e2 is unchanged (false branch)
    expect(next.document.edges.find(e => e.id === 'e2')!.label).toBeUndefined();
    expect(next.document.edges.find(e => e.id === 'e1')!.label).toBe('Updated');
  });

  it('GROUP_SELECTED with undefined document.groups falls back to [] (line 218)', () => {
    let state = makeState();
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    state = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1', 'n2'], edgeIds: [] } });
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const next = graphReducer(state, { type: 'GROUP_SELECTED', groupId: 'gx1' });
    expect(next.document.groups).toHaveLength(1);
    expect(next.document.groups![0].id).toBe('gx1');
  });

  it('UPDATE_GROUP_LABEL with undefined document.groups falls back to [] (line 271)', () => {
    let state = makeState();
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const next = graphReducer(state, { type: 'UPDATE_GROUP_LABEL', id: 'nonexistent', label: 'X' });
    expect(next.document.groups).toHaveLength(0);
  });

  it('UPDATE_GROUP_LABEL false branch: non-matching group returned unchanged (line 272)', () => {
    // Two groups; update label for g1 only; g2 hits the `: g` false branch
    const state = makeState();
    // Need 4 nodes for 2 groups of 2. Add n3 and n4.
    const n3 = createNode('rect', 300, 0, { id: 'n3' });
    const n4 = createNode('rect', 400, 0, { id: 'n4' });
    let s = graphReducer(state, { type: 'ADD_NODE', node: n3 });
    s = graphReducer(s, { type: 'ADD_NODE', node: n4 });
    s = graphReducer(s, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'], label: 'GroupA' });
    s = graphReducer(s, { type: 'CREATE_GROUP', memberIds: ['n3', 'n4'], label: 'GroupB' });
    const g1id = s.document.groups![0].id;
    const next = graphReducer(s, { type: 'UPDATE_GROUP_LABEL', id: g1id, label: 'Renamed' });
    // g1 was renamed, g2 unchanged (: g branch)
    expect(next.document.groups![0].label).toBe('Renamed');
    expect(next.document.groups![1].label).toBe('GroupB');
  });

  it('group operations with undefined groups falls back to [] (lines 230,249-284,295)', () => {
    // Strip groups from state before each group action to trigger the ?? [] fallback
    let state = makeState();
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;

    // UNGROUP_SELECTED with undefined groups (line 230)
    state = graphReducer(state, { type: 'SET_SELECTION', selection: { nodeIds: ['n1'], edgeIds: [] } });
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const ungrouped = graphReducer(state, { type: 'UNGROUP_SELECTED' });
    expect(ungrouped.document.groups).toHaveLength(0);

    // CREATE_GROUP with undefined groups (line 249)
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const created = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    expect(created.document.groups).toHaveLength(1);

    // DELETE_GROUP with undefined groups (line 260)
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const deleted = graphReducer(state, { type: 'DELETE_GROUP', id: 'nonexistent' });
    expect(deleted.document.groups).toHaveLength(0);

    // UPDATE_GROUP_LABEL with undefined groups (line 271)
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const labeled = graphReducer(state, { type: 'UPDATE_GROUP_LABEL', id: 'nonexistent', label: 'X' });
    expect(labeled.document.groups).toHaveLength(0);

    // ADD_TO_GROUP with undefined groups (line 284)
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const added = graphReducer(state, { type: 'ADD_TO_GROUP', groupId: 'nonexistent', nodeId: 'n1' });
    expect(added.document.groups).toHaveLength(0);

    // REMOVE_FROM_GROUP with undefined groups (line 295)
    (state.document as unknown as Record<string, unknown>)['groups'] = undefined;
    const removed = graphReducer(state, { type: 'REMOVE_FROM_GROUP', groupId: 'nonexistent', nodeId: 'n1' });
    expect(removed.document.groups).toHaveLength(0);
  });
});
