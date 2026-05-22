import { normalizeGraphInput } from '../normalizeGraphInput';
import type { GraphInput } from '../types';

const base: GraphInput = {
  schemaVersion: '1.0',
  rootId: 'root',
  nodes: [
    { id: 'root', label: 'R' },
    { id: 'a', label: 'A', fill: '#0a0' },
  ],
  edges: [{ from: 'root', to: 'a' }],
};

describe('normalizeGraphInput', () => {
  it('外部 ID を内部 node.id として保持する', () => {
    const doc = normalizeGraphInput(base);
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['a', 'root']);
  });

  it('座標が自動付与される（radial 既定）', () => {
    const doc = normalizeGraphInput(base);
    for (const n of doc.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it('fill を style.fill に反映する', () => {
    const doc = normalizeGraphInput(base);
    const a = doc.nodes.find((n) => n.id === 'a')!;
    expect(a.style.fill).toBe('#0a0');
  });

  it('未知 ID を参照するエッジはスキップする', () => {
    const doc = normalizeGraphInput({ ...base, edges: [{ from: 'root', to: 'ghost' }] });
    expect(doc.edges).toHaveLength(0);
  });

  it('重複 ID はエラー', () => {
    expect(() => normalizeGraphInput({ ...base, nodes: [{ id: 'x', label: '1' }, { id: 'x', label: '2' }] })).toThrow(/duplicate/i);
  });

  it('空 ID はエラー', () => {
    expect(() => normalizeGraphInput({ ...base, nodes: [{ id: '', label: '1' }] })).toThrow(/empty/i);
  });

  it('未知 schemaVersion はエラー', () => {
    expect(() => normalizeGraphInput({ ...base, schemaVersion: '9.9' as unknown as '1.0' })).toThrow(/schemaVersion/i);
  });
});
