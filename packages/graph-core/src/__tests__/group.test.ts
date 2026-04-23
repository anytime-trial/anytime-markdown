import { graphReducer, createInitialState } from '../state/reducer';
import { createNode, createDocument } from '../types';
import { computeGroupBounds } from '../engine/renderer';
import { hitTestGroup } from '../engine/hitTest';
import type { GraphState } from '../state/reducer';
import type { GraphNode, GraphGroup } from '../types';

function makeState(): GraphState {
  const doc = createDocument('Test');
  const n1 = createNode('rect', 10, 20, { id: 'n1', width: 100, height: 60 });
  const n2 = createNode('rect', 200, 100, { id: 'n2', width: 80, height: 50 });
  const n3 = createNode('rect', 400, 200, { id: 'n3', width: 120, height: 80 });
  doc.nodes = [n1, n2, n3];
  return createInitialState(doc);
}

function nodeMap(nodes: readonly GraphNode[]): Map<string, GraphNode> {
  return new Map(nodes.map(n => [n.id, n]));
}

// ---------------------------------------------------------------------------
// computeGroupBounds
// ---------------------------------------------------------------------------

describe('computeGroupBounds', () => {
  it('returns null for empty memberIds', () => {
    expect(computeGroupBounds([], new Map())).toBeNull();
  });

  it('returns null when no members found in nodeMap', () => {
    expect(computeGroupBounds(['missing'], new Map())).toBeNull();
  });

  it('calculates bounds with padding for two nodes', () => {
    const nodes: GraphNode[] = [
      createNode('rect', 10, 20, { id: 'n1', width: 100, height: 60 }),
      createNode('rect', 200, 100, { id: 'n2', width: 80, height: 50 }),
    ];
    const map = nodeMap(nodes);
    const bounds = computeGroupBounds(['n1', 'n2'], map);
    expect(bounds).not.toBeNull();
    // minX=10, minY=20, maxX=280(200+80), maxY=150(100+50), padding=16
    expect(bounds!.x).toBe(10 - 16);
    expect(bounds!.y).toBe(20 - 16);
    expect(bounds!.width).toBe(280 - 10 + 16 * 2);
    expect(bounds!.height).toBe(150 - 20 + 16 * 2);
  });

  it('calculates bounds for a single member', () => {
    const n = createNode('rect', 50, 50, { id: 'n1', width: 100, height: 80 });
    const bounds = computeGroupBounds(['n1'], nodeMap([n]));
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBe(50 - 16);
    expect(bounds!.y).toBe(50 - 16);
  });
});

// ---------------------------------------------------------------------------
// Reducer: CREATE_GROUP
// ---------------------------------------------------------------------------

describe('CREATE_GROUP', () => {
  it('creates a group with specified memberIds', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    expect(next.document.groups).toHaveLength(1);
    expect(next.document.groups![0].memberIds).toEqual(['n1', 'n2']);
    expect(next.document.groups![0].id).toBeTruthy();
  });

  it('assigns label when provided', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'], label: 'Frameworks' });
    expect(next.document.groups![0].label).toBe('Frameworks');
  });

  it('does not create group with fewer than 2 members', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1'] });
    expect(next.document.groups).toHaveLength(0);
  });

  it('adds to history', () => {
    const state = makeState();
    const next = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    expect(next.historyIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reducer: DELETE_GROUP
// ---------------------------------------------------------------------------

describe('DELETE_GROUP', () => {
  it('removes group by id, leaving members intact', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = withGroup.document.groups![0].id;
    const next = graphReducer(withGroup, { type: 'DELETE_GROUP', id: groupId });
    expect(next.document.groups).toHaveLength(0);
    expect(next.document.nodes).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Reducer: UPDATE_GROUP_LABEL
// ---------------------------------------------------------------------------

describe('UPDATE_GROUP_LABEL', () => {
  it('updates label of target group', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'], label: 'Old' });
    const groupId = withGroup.document.groups![0].id;
    const next = graphReducer(withGroup, { type: 'UPDATE_GROUP_LABEL', id: groupId, label: 'New' });
    expect(next.document.groups![0].label).toBe('New');
  });
});

// ---------------------------------------------------------------------------
// Reducer: ADD_TO_GROUP / REMOVE_FROM_GROUP
// ---------------------------------------------------------------------------

describe('ADD_TO_GROUP', () => {
  it('adds a new member to the group', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = withGroup.document.groups![0].id;
    const next = graphReducer(withGroup, { type: 'ADD_TO_GROUP', groupId, nodeId: 'n3' });
    expect(next.document.groups![0].memberIds).toContain('n3');
    expect(next.document.groups![0].memberIds).toHaveLength(3);
  });

  it('does not add duplicate member', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = withGroup.document.groups![0].id;
    const next = graphReducer(withGroup, { type: 'ADD_TO_GROUP', groupId, nodeId: 'n1' });
    expect(next.document.groups![0].memberIds).toHaveLength(2);
  });
});

describe('REMOVE_FROM_GROUP', () => {
  it('removes member from group', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2', 'n3'] });
    const groupId = withGroup.document.groups![0].id;
    const next = graphReducer(withGroup, { type: 'REMOVE_FROM_GROUP', groupId, nodeId: 'n1' });
    expect(next.document.groups![0].memberIds).not.toContain('n1');
    expect(next.document.groups![0].memberIds).toHaveLength(2);
  });

  it('auto-deletes group when member count drops below 2', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = withGroup.document.groups![0].id;
    const next = graphReducer(withGroup, { type: 'REMOVE_FROM_GROUP', groupId, nodeId: 'n1' });
    expect(next.document.groups).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// UNDO/REDO with groups
// ---------------------------------------------------------------------------

describe('UNDO/REDO with groups', () => {
  it('undoes CREATE_GROUP', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const undone = graphReducer(withGroup, { type: 'UNDO' });
    expect(undone.document.groups).toHaveLength(0);
  });

  it('redoes CREATE_GROUP', () => {
    const state = makeState();
    const withGroup = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const undone = graphReducer(withGroup, { type: 'UNDO' });
    const redone = graphReducer(undone, { type: 'REDO' });
    expect(redone.document.groups).toHaveLength(1);
  });

  it('UNDO restores nodes correctly after ADD_NODE', () => {
    const state = createInitialState();
    const n = createNode('rect', 0, 0, { id: 'nx' });
    const after = graphReducer(state, { type: 'ADD_NODE', node: n });
    const undone = graphReducer(after, { type: 'UNDO' });
    expect(undone.document.nodes).toHaveLength(0);
  });

  it('REDO restores nodes correctly after ADD_NODE', () => {
    const state = createInitialState();
    const n = createNode('rect', 0, 0, { id: 'nx' });
    const after = graphReducer(state, { type: 'ADD_NODE', node: n });
    const undone = graphReducer(after, { type: 'UNDO' });
    const redone = graphReducer(undone, { type: 'REDO' });
    expect(redone.document.nodes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hitTestGroup
// ---------------------------------------------------------------------------

describe('hitTestGroup', () => {
  const n1 = createNode('rect', 10, 20, { id: 'n1', width: 100, height: 60 });
  const n2 = createNode('rect', 200, 100, { id: 'n2', width: 80, height: 50 });
  const map = nodeMap([n1, n2]);
  const group: GraphGroup = { id: 'g1', memberIds: ['n1', 'n2'] };

  it('hits group when clicking empty space inside bounds', () => {
    // bounds: x=-6, y=4, width=302, height=162 (with padding 16)
    // Empty space well inside the group, not on any node
    const result = hitTestGroup(150, 80, [group], map);
    expect(result?.id).toBe('g1');
  });

  it('misses when clicking outside group bounds', () => {
    const result = hitTestGroup(1000, 1000, [group], map);
    expect(result).toBeNull();
  });

  it('misses when clicking on a member node', () => {
    // Click on n1 (10, 20, 100x60)
    const result = hitTestGroup(50, 40, [group], map);
    expect(result).toBeNull();
  });
});
