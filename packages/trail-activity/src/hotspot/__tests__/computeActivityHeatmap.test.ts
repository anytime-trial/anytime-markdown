import { computeActivityHeatmap } from '../computeActivityHeatmap';

describe('computeActivityHeatmap', () => {
  test('sums duplicate (rowKey, filePath) cells', () => {
    const result = computeActivityHeatmap({
      rows: [
        { rowKey: 'session-1', filePath: 'a.ts', count: 1 },
        { rowKey: 'session-1', filePath: 'a.ts', count: 2 },
      ],
      mode: 'session-file',
      topK: 10,
    });
    expect(result.cellsByRowFile.get('session-1')?.get('a.ts')).toBe(3);
    expect(result.maxValue).toBe(3);
  });

  test('Top-K filters rows by total count', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      rowKey: `session-${String(i).padStart(3, '0')}`,
      filePath: 'a.ts',
      count: i + 1,
    }));
    const result = computeActivityHeatmap({ rows, mode: 'session-file', topK: 10 });
    expect(result.rows).toHaveLength(10);
    expect(result.rows[0].id).toBe('session-099');
  });

  test('rowKeys with zero data are not included', () => {
    const result = computeActivityHeatmap({
      rows: [
        { rowKey: 'r1', filePath: 'a.ts', count: 1 },
        { rowKey: 'r2', filePath: 'b.ts', count: 1 },
      ],
      mode: 'session-file',
      topK: 10,
    });
    const keys = result.rows.map((r) => r.id);
    expect(keys).toContain('r1');
    expect(keys).toContain('r2');
    expect(result.cellsByRowFile.get('r1')?.size).toBe(1);
    expect(result.cellsByRowFile.get('r2')?.size).toBe(1);
  });

  test('subagent-file mode uses subagent rowKey', () => {
    const result = computeActivityHeatmap({
      rows: [
        { rowKey: 'general-purpose', filePath: 'a.ts', count: 4 },
        { rowKey: 'Explore', filePath: 'b.ts', count: 1 },
      ],
      mode: 'subagent-file',
      topK: 10,
      rowLabelResolver: (k) => `agent:${k}`,
    });
    expect(result.rows[0].id).toBe('general-purpose');
    expect(result.rows[0].label).toBe('agent:general-purpose');
  });
});
