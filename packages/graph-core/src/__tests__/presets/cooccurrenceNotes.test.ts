import {
  deleteCooccurrenceLink,
  deleteCooccurrenceNode,
  removeCooccurrenceClusterNote,
  removeCooccurrenceLinkNote,
  removeCooccurrenceNodeNote,
  setCooccurrenceClusterNote,
  setCooccurrenceLinkNote,
  setCooccurrenceNodeNote,
} from '../../presets/cooccurrenceEdit';
import {
  COOCCURRENCE_NOTE_MAX_LENGTH,
  readCooccurrenceNote,
  noteBearingIndexes,
} from '../../presets/cooccurrenceNotes';
import {
  computeSpecHash,
  parseCoocFile,
  schemaVersionForSpec,
  serializeCoocFile,
  validateCooccurrenceFile,
  type CooccurrenceFile,
} from '../../presets/cooccurrenceFile';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'A', frequency: 10 },
        { label: 'B', frequency: 8 },
        { label: 'C', frequency: 6 },
      ],
      links: [
        [0, 1, 0.9],
        [1, 2, 0.8],
      ],
      clusters: [{ label: 'alpha', members: [0, 2] }],
    },
  };
}

function unwrap(result: ReturnType<typeof setCooccurrenceNodeNote>): CooccurrenceFile {
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.file;
}

describe('メモの設定と読み出し', () => {
  it('語へメモを設定すると、その語から改行を保って読み出せる', () => {
    const next = unwrap(setCooccurrenceNodeNote(file(), 1, '一行目\n二行目'));
    expect(readCooccurrenceNote(next.spec, 'nodes', 1)).toBe('一行目\n二行目');
    expect(readCooccurrenceNote(next.spec, 'nodes', 0)).toBeUndefined();
  });

  it('共起とクラスタにも独立したメモを持てる', () => {
    let next = unwrap(setCooccurrenceLinkNote(file(), 0, '共起のメモ'));
    next = unwrap(setCooccurrenceClusterNote(next, 0, 'クラスタのメモ'));
    expect(readCooccurrenceNote(next.spec, 'links', 0)).toBe('共起のメモ');
    expect(readCooccurrenceNote(next.spec, 'clusters', 0)).toBe('クラスタのメモ');
    expect(readCooccurrenceNote(next.spec, 'nodes', 0)).toBeUndefined();
  });

  it('同じ対象へ設定し直すと上書きになり、項目は増えない', () => {
    let next = unwrap(setCooccurrenceNodeNote(file(), 1, '古い'));
    next = unwrap(setCooccurrenceNodeNote(next, 1, '新しい'));
    expect(next.spec.notes?.nodes).toEqual([[1, '新しい']]);
  });

  it('メモを削除すると項目が消え、空になった notes は残らない', () => {
    const withNote = unwrap(setCooccurrenceNodeNote(file(), 1, 'メモ'));
    const next = unwrap(removeCooccurrenceNodeNote(withNote, 1));
    expect(readCooccurrenceNote(next.spec, 'nodes', 1)).toBeUndefined();
    expect(next.spec.notes).toBeUndefined();
  });

  it('メモを持つ対象の添字を一覧できる（図の印に使う）', () => {
    let next = unwrap(setCooccurrenceNodeNote(file(), 2, 'メモ'));
    next = unwrap(setCooccurrenceNodeNote(next, 0, 'メモ'));
    expect([...noteBearingIndexes(next.spec, 'nodes')].sort()).toEqual([0, 2]);
    expect(noteBearingIndexes(next.spec, 'links').size).toBe(0);
  });
});

describe('メモの検証', () => {
  it('空文字のメモを拒否し、既存のメモを消さない', () => {
    const withNote = unwrap(setCooccurrenceNodeNote(file(), 1, '残る'));
    const result = setCooccurrenceNodeNote(withNote, 1, '');
    expect(result.ok).toBe(false);
    expect(readCooccurrenceNote(withNote.spec, 'nodes', 1)).toBe('残る');
  });

  it('上限ちょうどは受理し、1 文字超過は拒否する', () => {
    expect(setCooccurrenceNodeNote(file(), 1, 'あ'.repeat(COOCCURRENCE_NOTE_MAX_LENGTH)).ok).toBe(true);
    const over = setCooccurrenceNodeNote(file(), 1, 'あ'.repeat(COOCCURRENCE_NOTE_MAX_LENGTH + 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors[0].code).toBe('note-too-long');
  });

  it('対象の範囲外を指すメモを持つファイルを拒否する', () => {
    const invalid = {
      meta: { schemaVersion: 3, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
      spec: { ...file().spec, notes: { nodes: [[5, 'メモ']] } },
    };
    const errors = validateCooccurrenceFile(invalid);
    expect(errors.map((e) => e.code)).toContain('note-target-out-of-range');
  });

  it('同じ対象を指すメモが 2 件あるファイルを拒否する', () => {
    const invalid = {
      meta: { schemaVersion: 3, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
      spec: { ...file().spec, notes: { nodes: [[1, 'あ'], [1, 'い']] } },
    };
    const errors = validateCooccurrenceFile(invalid);
    expect(errors.map((e) => e.code)).toContain('duplicate-note-target');
  });

  it('版数 2 のファイルにメモがあると拒否する', () => {
    const invalid = {
      meta: { schemaVersion: 2, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
      spec: { ...file().spec, links: [[0, 1, 0.9, 1]], notes: { nodes: [[1, 'メモ']] } },
    };
    const errors = validateCooccurrenceFile(invalid);
    expect(errors.map((e) => e.code)).toContain('invalid-schema');
  });
});

describe('版数の導出', () => {
  it('メモも向きも無ければ 1、向きだけなら 2、メモがあれば 3', () => {
    const base = file().spec;
    expect(schemaVersionForSpec(base)).toBe(1);
    expect(schemaVersionForSpec({ ...base, links: [[0, 1, 0.9, 1]] })).toBe(2);
    expect(schemaVersionForSpec({ ...base, notes: { nodes: [[1, 'メモ']] } })).toBe(3);
    expect(schemaVersionForSpec({ ...base, links: [[0, 1, 0.9, 1]], notes: { nodes: [[1, 'メモ']] } })).toBe(3);
  });

  it('保存すると版数が内容に追従し、メモを消すと 1 へ戻る', () => {
    const withNote = unwrap(setCooccurrenceNodeNote(file(), 1, 'メモ'));
    const saved = parseCoocFile(serializeCoocFile(withNote));
    expect(saved.meta.schemaVersion).toBe(3);
    expect(readCooccurrenceNote(saved.spec, 'nodes', 1)).toBe('メモ');

    const cleared = parseCoocFile(serializeCoocFile(unwrap(removeCooccurrenceNodeNote(saved, 1))));
    expect(cleared.meta.schemaVersion).toBe(1);
    expect(cleared.spec.notes).toBeUndefined();
  });
});

describe('メモは座標に影響しない', () => {
  it('メモの有無で specHash が変わらない', () => {
    const before = file();
    const after = unwrap(setCooccurrenceNodeNote(before, 1, 'メモ'));
    expect(computeSpecHash(after.spec)).toBe(computeSpecHash(before.spec));
  });
});

describe('削除に伴う添字の付け替え', () => {
  it('先頭の語を削除しても、残る語のメモが同じ語に付いたままになる', () => {
    let next = unwrap(setCooccurrenceNodeNote(file(), 2, 'C のメモ'));
    next = unwrap(deleteCooccurrenceNode(next, 0));
    // 削除前の添字 2（語 C）は、削除後に添字 1 へ繰り上がる
    expect(next.spec.nodes[1].label).toBe('C');
    expect(readCooccurrenceNote(next.spec, 'nodes', 1)).toBe('C のメモ');
  });

  it('削除した語のメモは残らない', () => {
    let next = unwrap(setCooccurrenceNodeNote(file(), 0, 'A のメモ'));
    next = unwrap(setCooccurrenceNodeNote(next, 2, 'C のメモ'));
    next = unwrap(deleteCooccurrenceNode(next, 0));
    expect(noteBearingIndexes(next.spec, 'nodes').size).toBe(1);
    expect(readCooccurrenceNote(next.spec, 'nodes', 1)).toBe('C のメモ');
  });

  it('語を削除して共起が道連れになったとき、共起のメモも付け替わる', () => {
    // links: [0,1] と [1,2]。語 0 を消すと [0,1] が消え、[1,2] が [0,1] へ繰り上がる
    let next = unwrap(setCooccurrenceLinkNote(file(), 1, '残る共起のメモ'));
    next = unwrap(setCooccurrenceLinkNote(next, 0, '消える共起のメモ'));
    next = unwrap(deleteCooccurrenceNode(next, 0));
    expect(next.spec.links).toHaveLength(1);
    expect(readCooccurrenceNote(next.spec, 'links', 0)).toBe('残る共起のメモ');
  });

  it('共起を直接削除してもメモが付け替わる', () => {
    const next = unwrap(deleteCooccurrenceLink(unwrap(setCooccurrenceLinkNote(file(), 1, 'メモ')), 0));
    expect(readCooccurrenceNote(next.spec, 'links', 0)).toBe('メモ');
  });

  it('メモを持たない図の削除では notes が生えない', () => {
    const next = unwrap(deleteCooccurrenceNode(file(), 0));
    expect(next.spec.notes).toBeUndefined();
  });

  it('クラスタのメモは語の削除で動かない', () => {
    let next = unwrap(setCooccurrenceClusterNote(file(), 0, 'クラスタのメモ'));
    next = unwrap(deleteCooccurrenceNode(next, 0));
    expect(readCooccurrenceNote(next.spec, 'clusters', 0)).toBe('クラスタのメモ');
  });

  it('クラスタのメモを削除できる', () => {
    const withNote = unwrap(setCooccurrenceClusterNote(file(), 0, 'メモ'));
    const next = unwrap(removeCooccurrenceClusterNote(withNote, 0));
    expect(readCooccurrenceNote(next.spec, 'clusters', 0)).toBeUndefined();
  });

  it('共起のメモを削除できる', () => {
    const withNote = unwrap(setCooccurrenceLinkNote(file(), 0, 'メモ'));
    const next = unwrap(removeCooccurrenceLinkNote(withNote, 0));
    expect(readCooccurrenceNote(next.spec, 'links', 0)).toBeUndefined();
  });
});
