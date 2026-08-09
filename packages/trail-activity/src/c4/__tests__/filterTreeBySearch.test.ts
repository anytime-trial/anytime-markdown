import type { C4TreeNode } from '../types';
import { filterTreeBySearch } from '../view/filterTreeBySearch';

const tree: C4TreeNode[] = [
  { id: 'user', name: 'User', type: 'person', children: [] },
  {
    id: 'sys', name: 'MySystem', type: 'boundary', children: [
      {
        id: 'web', name: 'WebApp', type: 'container', children: [
          { id: 'auth', name: 'AuthService', type: 'component', children: [] },
        ],
      },
      { id: 'db', name: 'Database', type: 'containerDb', children: [] },
    ],
  },
];

describe('filterTreeBySearch', () => {
  it('空クエリのとき元ツリーをそのまま返す', () => {
    expect(filterTreeBySearch(tree, '')).toBe(tree);
  });

  it('空白のみのクエリのとき元ツリーをそのまま返す', () => {
    expect(filterTreeBySearch(tree, '   ')).toBe(tree);
  });

  it('一致なしのとき空配列を返す', () => {
    const result = filterTreeBySearch(tree, 'xxxxxx');
    expect(result).toHaveLength(0);
  });

  it('ルートレベルの要素名に一致するとき返す', () => {
    const result = filterTreeBySearch(tree, 'user');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('user');
  });

  it('大文字小文字を無視する', () => {
    const result = filterTreeBySearch(tree, 'USER');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('user');
  });

  it('部分一致で検索できる', () => {
    const result = filterTreeBySearch(tree, 'App');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sys');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('web');
  });

  it('深い子孫に一致するとき祖先ノードも残す', () => {
    const result = filterTreeBySearch(tree, 'Auth');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sys');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('web');
    expect(result[0].children[0].children).toHaveLength(1);
    expect(result[0].children[0].children[0].id).toBe('auth');
  });

  it('兄弟ノードのうち一致するものだけ残す', () => {
    const result = filterTreeBySearch(tree, 'Database');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('db');
  });
});
