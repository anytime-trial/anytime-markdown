import type { HierarchyTreeItem } from '../buildHierarchyTreeData';
import { flattenTree } from '../flattenTree';

const leaf = (id: string, label = id): HierarchyTreeItem => ({
  id,
  label,
  secondary: '',
  cycle: false,
  revisited: false,
  filePath: 'a.ts',
  line: 1,
  children: [],
});

const node = (id: string, children: HierarchyTreeItem[]): HierarchyTreeItem => ({
  ...leaf(id),
  children,
});

describe('flattenTree', () => {
  it('returns only the root when expanded is empty', () => {
    const root = node('a', [leaf('b'), leaf('c')]);
    const rows = flattenTree(root, new Set());
    expect(rows.map(r => r.item.id)).toEqual(['a']);
    expect(rows[0].level).toBe(0);
    expect(rows[0].hasChildren).toBe(true);
  });

  it('returns root and children when root is expanded', () => {
    const root = node('a', [leaf('b'), leaf('c')]);
    const rows = flattenTree(root, new Set(['a']));
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b', 'c']);
    expect(rows[1].level).toBe(1);
    expect(rows[2].level).toBe(1);
  });

  it('recurses into expanded grandchildren', () => {
    const root = node('a', [node('b', [leaf('c'), leaf('d')])]);
    const rows = flattenTree(root, new Set(['a', 'b']));
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map(r => r.level)).toEqual([0, 1, 2, 2]);
  });

  it('stops at cycle nodes regardless of expanded set', () => {
    const cycleChild: HierarchyTreeItem = { ...leaf('cycle-x'), cycle: true, children: [leaf('hidden')] };
    const root = node('a', [cycleChild]);
    const rows = flattenTree(root, new Set(['a', 'cycle-x']));
    expect(rows.map(r => r.item.id)).toEqual(['a', 'cycle-x']);
    const cycleRow = rows.find(r => r.item.id === 'cycle-x')!;
    expect(cycleRow.hasChildren).toBe(false);
  });

  it('stops at revisited nodes regardless of expanded set', () => {
    const revisitedChild: HierarchyTreeItem = { ...leaf('rev'), revisited: true, children: [leaf('hidden')] };
    const root = node('a', [revisitedChild]);
    const rows = flattenTree(root, new Set(['a', 'rev']));
    expect(rows.map(r => r.item.id)).toEqual(['a', 'rev']);
  });

  it('marks hasChildren=false when an expandable node has no children', () => {
    const root = leaf('a');
    const rows = flattenTree(root, new Set(['a']));
    expect(rows[0].hasChildren).toBe(false);
  });
});
