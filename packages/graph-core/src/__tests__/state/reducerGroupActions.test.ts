import { graphReducer, createInitialState } from '../../state/reducer';
import { createNode, createDocument } from '../../types';
import type { GraphState } from '../../state/reducer';

function makeStateWithTwoNodes(): GraphState {
  const doc = createDocument('Test');
  doc.nodes = [
    createNode('rect', 10, 20, { id: 'n1', text: 'A' }),
    createNode('rect', 200, 100, { id: 'n2', text: 'B' }),
  ];
  return createInitialState(doc);
}

describe('graphReducer group actions (uncovered lines 208-235, 404)', () => {
  it('GROUP_SELECTED creates group when >= 2 nodes selected', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, {
      type: 'SET_SELECTION',
      selection: { nodeIds: ['n1', 'n2'], edgeIds: [] },
    });
    s = graphReducer(s, { type: 'GROUP_SELECTED' });
    expect(s.document.groups).toHaveLength(1);
    expect(s.document.groups![0].memberIds).toEqual(['n1', 'n2']);
  });

  it('GROUP_SELECTED uses provided groupId when given', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, {
      type: 'SET_SELECTION',
      selection: { nodeIds: ['n1', 'n2'], edgeIds: [] },
    });
    s = graphReducer(s, { type: 'GROUP_SELECTED', groupId: 'my-group-id' });
    expect(s.document.groups![0].id).toBe('my-group-id');
  });

  it('GROUP_SELECTED does nothing when fewer than 2 nodes selected', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, {
      type: 'SET_SELECTION',
      selection: { nodeIds: ['n1'], edgeIds: [] },
    });
    const before = s.historyIndex;
    s = graphReducer(s, { type: 'GROUP_SELECTED' });
    expect(s.document.groups ?? []).toHaveLength(0);
    expect(s.historyIndex).toBe(before); // no history entry added
  });

  it('UNGROUP_SELECTED removes groups containing any selected node', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, {
      type: 'SET_SELECTION',
      selection: { nodeIds: ['n1', 'n2'], edgeIds: [] },
    });
    s = graphReducer(s, { type: 'GROUP_SELECTED', groupId: 'g1' });
    expect(s.document.groups).toHaveLength(1);

    // Select n1 and ungroup
    s = graphReducer(s, {
      type: 'SET_SELECTION',
      selection: { nodeIds: ['n1'], edgeIds: [] },
    });
    s = graphReducer(s, { type: 'UNGROUP_SELECTED' });
    expect(s.document.groups).toHaveLength(0);
  });

  it('UNGROUP_SELECTED does not remove groups with no selected members', () => {
    const doc = createDocument('Test');
    doc.nodes = [
      createNode('rect', 0, 0, { id: 'n1' }),
      createNode('rect', 100, 0, { id: 'n2' }),
      createNode('rect', 200, 0, { id: 'n3' }),
    ];
    let s = createInitialState(doc);
    // Group n1+n2
    s = graphReducer(s, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    // Group n2+n3
    s = graphReducer(s, { type: 'CREATE_GROUP', memberIds: ['n2', 'n3'] });
    expect(s.document.groups).toHaveLength(2);

    // Select only n3 — only second group gets ungrouped
    s = graphReducer(s, {
      type: 'SET_SELECTION',
      selection: { nodeIds: ['n3'], edgeIds: [] },
    });
    s = graphReducer(s, { type: 'UNGROUP_SELECTED' });
    expect(s.document.groups).toHaveLength(1);
    expect(s.document.groups![0].memberIds).toContain('n1');
  });

  it('default action returns state unchanged (line 404)', () => {
    const state = makeStateWithTwoNodes();
    // dispatch an unknown action type via cast to trigger the default branch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = graphReducer(state, { type: '__UNKNOWN__' } as any);
    expect(next).toBe(state);
  });

  it('UPDATE_GROUP_LABEL updates the label of a group', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'], label: 'original' });
    const groupId = s.document.groups![0].id;
    s = graphReducer(s, { type: 'UPDATE_GROUP_LABEL', id: groupId, label: 'updated' });
    expect(s.document.groups![0].label).toBe('updated');
  });

  it('ADD_TO_GROUP adds a node to an existing group', () => {
    const doc = createDocument('Test');
    doc.nodes = [
      createNode('rect', 0, 0, { id: 'n1' }),
      createNode('rect', 100, 0, { id: 'n2' }),
      createNode('rect', 200, 0, { id: 'n3' }),
    ];
    let s = createInitialState(doc);
    s = graphReducer(s, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = s.document.groups![0].id;
    s = graphReducer(s, { type: 'ADD_TO_GROUP', groupId, nodeId: 'n3' });
    expect(s.document.groups![0].memberIds).toContain('n3');
  });

  it('ADD_TO_GROUP does not duplicate node already in group', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = s.document.groups![0].id;
    const before = s.document.groups![0].memberIds.length;
    s = graphReducer(s, { type: 'ADD_TO_GROUP', groupId, nodeId: 'n1' });
    expect(s.document.groups![0].memberIds.length).toBe(before);
  });

  it('REMOVE_FROM_GROUP removes node and deletes group if fewer than 2 members remain', () => {
    const state = makeStateWithTwoNodes();
    let s = graphReducer(state, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2'] });
    const groupId = s.document.groups![0].id;
    s = graphReducer(s, { type: 'REMOVE_FROM_GROUP', groupId, nodeId: 'n1' });
    // Only 1 member left → group should be removed
    expect(s.document.groups).toHaveLength(0);
  });

  it('REMOVE_FROM_GROUP preserves group when >= 2 members remain', () => {
    const doc = createDocument('Test');
    doc.nodes = [
      createNode('rect', 0, 0, { id: 'n1' }),
      createNode('rect', 100, 0, { id: 'n2' }),
      createNode('rect', 200, 0, { id: 'n3' }),
    ];
    let s = createInitialState(doc);
    s = graphReducer(s, { type: 'CREATE_GROUP', memberIds: ['n1', 'n2', 'n3'] });
    const groupId = s.document.groups![0].id;
    s = graphReducer(s, { type: 'REMOVE_FROM_GROUP', groupId, nodeId: 'n3' });
    // 2 members left → group stays
    expect(s.document.groups).toHaveLength(1);
    expect(s.document.groups![0].memberIds).not.toContain('n3');
  });
});
