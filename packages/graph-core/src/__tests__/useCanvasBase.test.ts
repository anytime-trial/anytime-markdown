/**
 * useCanvasBase — characterization test for extracted helper
 */
import { deleteGroupsContainingSelection } from '../hooks/useCanvasBase';
import type { GraphGroup } from '../types';

function makeGroup(id: string, memberIds: string[]): GraphGroup {
  return { id, memberIds, label: id };
}

describe('deleteGroupsContainingSelection', () => {
  it('dispatches DELETE_GROUP for each group that overlaps the selection', () => {
    const dispatch = jest.fn();
    const groups = [makeGroup('g1', ['n1', 'n2']), makeGroup('g2', ['n3'])];
    deleteGroupsContainingSelection(new Set(['n1']), groups, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_GROUP', id: 'g1' });
  });

  it('dispatches for multiple matching groups', () => {
    const dispatch = jest.fn();
    const groups = [makeGroup('g1', ['n1']), makeGroup('g2', ['n2'])];
    deleteGroupsContainingSelection(new Set(['n1', 'n2']), groups, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch when no group overlaps', () => {
    const dispatch = jest.fn();
    const groups = [makeGroup('g1', ['n9'])];
    deleteGroupsContainingSelection(new Set(['n1']), groups, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when dispatch is undefined', () => {
    // should not throw
    const groups = [makeGroup('g1', ['n1'])];
    expect(() => deleteGroupsContainingSelection(new Set(['n1']), groups, undefined)).not.toThrow();
  });

  it('does nothing when groups list is empty', () => {
    const dispatch = jest.fn();
    deleteGroupsContainingSelection(new Set(['n1']), [], dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
