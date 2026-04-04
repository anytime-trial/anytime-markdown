import type { C4TreeNode } from '../types';
import { filterTreeByLevel } from '../view/buildElementTree';

const tree: C4TreeNode[] = [
  {
    id: 'user', name: 'User', type: 'person', children: [],
  },
  {
    id: 'sys', name: 'System', type: 'boundary', children: [
      {
        id: 'web', name: 'Web App', type: 'container', children: [
          {
            id: 'comp1', name: 'Auth', type: 'component', children: [
              { id: 'code1', name: 'login.ts', type: 'code', children: [] },
            ],
          },
        ],
      },
      { id: 'db', name: 'Database', type: 'containerDb', children: [] },
    ],
  },
];

describe('filterTreeByLevel', () => {
  it('L4: 全要素を返す', () => {
    const result = filterTreeByLevel(tree, 4);
    expect(result).toHaveLength(2);
    expect(result[1].children).toHaveLength(2);
    expect(result[1].children[0].children).toHaveLength(1);
    expect(result[1].children[0].children[0].children).toHaveLength(1);
  });

  it('L3: code要素を除外する', () => {
    const result = filterTreeByLevel(tree, 3);
    expect(result).toHaveLength(2);
    expect(result[1].children[0].children).toHaveLength(1);
    // componentのchildrenからcodeが消える
    expect(result[1].children[0].children[0].children).toHaveLength(0);
  });

  it('L2: component・code要素を除外する', () => {
    const result = filterTreeByLevel(tree, 2);
    expect(result).toHaveLength(2);
    // containerのchildrenからcomponentが消える
    expect(result[1].children[0].children).toHaveLength(0);
    // containerDb は残る
    expect(result[1].children[1].id).toBe('db');
  });

  it('L1: person・system・boundaryのみ、container以下を除外', () => {
    const result = filterTreeByLevel(tree, 1);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('user');
    // boundaryの子（container）は除外
    expect(result[1].children).toHaveLength(0);
  });

  it('子が全て除外された境界は残る（空の境界として）', () => {
    const result = filterTreeByLevel(tree, 1);
    expect(result[1].type).toBe('boundary');
    expect(result[1].children).toHaveLength(0);
  });
});
