import {
  buildHierarchyTreeData,
  findItemById,
  replaceItemChildren,
  type ApiHierarchyNode,
} from '../buildHierarchyTreeData';

const apiLeaf = (id: string, label = id, filePath = 'a.ts', line = 1): ApiHierarchyNode => ({
  id,
  label,
  filePath,
  line,
  children: [],
});

describe('buildHierarchyTreeData', () => {
  it('produces secondary string in filePath:line format', () => {
    const result = buildHierarchyTreeData(apiLeaf('id1', 'foo', 'src/a.ts', 42), '(cycle)');
    expect(result.secondary).toBe('src/a.ts:42');
    expect(result.label).toBe('foo');
    expect(result.cycle).toBe(false);
  });

  it('appends cycle label when the node is marked as cycle', () => {
    const result = buildHierarchyTreeData(
      { ...apiLeaf('id1', 'foo'), cycle: true },
      '(cycle)',
    );
    expect(result.label).toBe('foo (cycle)');
    expect(result.cycle).toBe(true);
  });

  it('recursively converts children', () => {
    const api: ApiHierarchyNode = {
      ...apiLeaf('root', 'root'),
      children: [
        { ...apiLeaf('c1', 'child1'), children: [apiLeaf('g1', 'grand1')] },
        apiLeaf('c2', 'child2'),
      ],
    };
    const result = buildHierarchyTreeData(api, '(cycle)');
    expect(result.children.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(result.children[0].children.map(c => c.id)).toEqual(['g1']);
  });

  it('preserves filePath and line on every node', () => {
    const api = apiLeaf('id1', 'foo', 'src/x.ts', 99);
    const result = buildHierarchyTreeData(api, '(cycle)');
    expect(result.filePath).toBe('src/x.ts');
    expect(result.line).toBe(99);
  });
});

describe('findItemById', () => {
  it('returns the root when ids match', () => {
    const tree = buildHierarchyTreeData(apiLeaf('root'), '(c)');
    expect(findItemById(tree, 'root')).toBe(tree);
  });

  it('finds nested children', () => {
    const tree = buildHierarchyTreeData(
      { ...apiLeaf('root'), children: [{ ...apiLeaf('child'), children: [apiLeaf('grand')] }] },
      '(c)',
    );
    expect(findItemById(tree, 'grand')?.id).toBe('grand');
  });

  it('returns null for unknown id', () => {
    const tree = buildHierarchyTreeData(apiLeaf('root'), '(c)');
    expect(findItemById(tree, 'missing')).toBeNull();
  });
});

describe('replaceItemChildren', () => {
  it('replaces children of the targeted node', () => {
    const tree = buildHierarchyTreeData(
      { ...apiLeaf('root'), children: [apiLeaf('child')] },
      '(c)',
    );
    const newChild = buildHierarchyTreeData(apiLeaf('newChild'), '(c)');
    const updated = replaceItemChildren(tree, 'child', [newChild]);
    expect(updated.children[0].children.map(c => c.id)).toEqual(['newChild']);
  });

  it('leaves untouched branches alone', () => {
    const tree = buildHierarchyTreeData(
      {
        ...apiLeaf('root'),
        children: [
          { ...apiLeaf('a'), children: [apiLeaf('a1')] },
          { ...apiLeaf('b'), children: [apiLeaf('b1')] },
        ],
      },
      '(c)',
    );
    const updated = replaceItemChildren(tree, 'a', []);
    const branchA = updated.children.find(c => c.id === 'a');
    const branchB = updated.children.find(c => c.id === 'b');
    expect(branchA?.children).toEqual([]);
    expect(branchB?.children.map(c => c.id)).toEqual(['b1']);
  });
});
