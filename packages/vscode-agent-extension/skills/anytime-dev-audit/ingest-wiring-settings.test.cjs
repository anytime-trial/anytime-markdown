const {
  parseJsonc,
  isTrailingComma,
  mergeSettings,
  flattenSettings,
  settingsCandidates,
} = require('./ingest-wiring-settings.cjs');

describe('parseJsonc', () => {
  it('行コメント・ブロックコメント・末尾カンマを許容する', () => {
    const text = `{
      // 行コメント
      "a": 1, /* ブロック */
      "b": "x",
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: 'x' });
  });

  it('文字列リテラル内の // は除去しない', () => {
    expect(parseJsonc('{"url": "http://example.com"}')).toEqual({ url: 'http://example.com' });
  });

  it('文字列リテラル内の「, }」を末尾カンマとして書き換えない', () => {
    // 走査後の文字列全体へ正規表現を当てると "x, }" が "x }" に化け、
    // 実在しないパスを設定値として報告することになる。
    expect(parseJsonc('{"a": "x, }", "b": 1}')).toEqual({ a: 'x, }', b: 1 });
    expect(parseJsonc('{"p": "/tmp/a, ]"}')).toEqual({ p: '/tmp/a, ]' });
  });

  it('エスケープされた引用符をまたいでも文字列の内外を取り違えない', () => {
    expect(parseJsonc('{"a": "he said \\"hi, }\\"", "b": 2}')).toEqual({ a: 'he said "hi, }"', b: 2 });
  });

  it('末尾カンマと閉じ括弧の間にコメントが挟まっても除去できる', () => {
    expect(parseJsonc('{"a": 1, // 末尾\n}')).toEqual({ a: 1 });
    expect(parseJsonc('{"a": 1, /* c */ }')).toEqual({ a: 1 });
  });

  it('配列の末尾カンマも除去する', () => {
    expect(parseJsonc('{"a": [1, 2, ]}')).toEqual({ a: [1, 2] });
  });

  it('区切りとしてのカンマは残す', () => {
    expect(parseJsonc('{"a": 1, "b": 2}')).toEqual({ a: 1, b: 2 });
  });

  it('空文字・非文字列は null（未配置の候補ファイルを解析失敗として扱わないため）', () => {
    expect(parseJsonc('')).toBeNull();
    expect(parseJsonc('   ')).toBeNull();
    expect(parseJsonc(null)).toBeNull();
  });

  it('壊れた JSON は null を返し、理由をログへ出す（silent catch にしない）', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseJsonc('{"a": }')).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('JSONC 解析に失敗'));
    spy.mockRestore();
  });
});

describe('isTrailingComma', () => {
  it('次の実体が閉じ括弧なら true', () => {
    expect(isTrailingComma('  }', 0)).toBe(true);
    expect(isTrailingComma('\n ]', 0)).toBe(true);
  });

  it('次の実体が値なら false', () => {
    expect(isTrailingComma(' "b": 1}', 0)).toBe(false);
  });

  it('閉じられていないコメントで終わる場合は false（誤って区切りを消さない）', () => {
    expect(isTrailingComma(' /* 閉じない', 0)).toBe(false);
  });
});

describe('mergeSettings', () => {
  it('Machine → User → ワークスペースの順で後勝ちし、由来ファイルを残す', () => {
    const merged = mergeSettings([
      { scope: 'machine', file: '/m.json', content: '{"anytimeTrail.workspace.path": "/from-machine"}' },
      { scope: 'user', file: '/u.json', content: '{"anytimeTrail.workspace.path": "/from-user"}' },
      { scope: 'workspace', file: '/w.json', content: '{"anytimeTrail.workspace.path": "/from-ws"}' },
    ]);
    expect(merged.values['anytimeTrail.workspace.path']).toEqual({
      value: '/from-ws',
      source: '/w.json',
      scope: 'workspace',
    });
  });

  it('ネスト表記もドット区切りのフラットキーとして引ける', () => {
    const merged = mergeSettings([
      { scope: 'workspace', file: '/w.json', content: '{"anytimeMarkdown": {"docsRoot": "/docs"}}' },
    ]);
    expect(merged.values['anytimeMarkdown.docsRoot'].value).toBe('/docs');
  });

  it('未配置（content=null）の候補は loaded:false として記録し、値には影響しない', () => {
    const merged = mergeSettings([
      { scope: 'machine', file: '/m.json', content: null },
      { scope: 'workspace', file: '/w.json', content: '{"k": 1}' },
    ]);
    expect(merged.files[0]).toEqual({ scope: 'machine', file: '/m.json', loaded: false });
    expect(merged.values.k.value).toBe(1);
  });
});

describe('flattenSettings', () => {
  it('葉と中間ノードの両方を引けるようにする', () => {
    expect(flattenSettings({ a: { b: 1 } })).toEqual([
      ['a', { b: 1 }],
      ['a.b', 1],
    ]);
  });

  it('配列は葉として扱う', () => {
    expect(flattenSettings({ a: [1, 2] })).toEqual([['a', [1, 2]]]);
  });
});

describe('settingsCandidates', () => {
  it('Machine → User → ワークスペースの順に並べる', () => {
    const files = settingsCandidates('/ws', '/home/u', 'linux').map((c) => c.file);
    expect(files).toEqual([
      '/home/u/.vscode-server/data/Machine/settings.json',
      '/home/u/.vscode-server/data/User/settings.json',
      '/home/u/.config/Code/User/settings.json',
      '/ws/.vscode/settings.json',
    ]);
  });

  it('macOS では User 設定の場所が変わる', () => {
    const files = settingsCandidates('/ws', '/Users/u', 'darwin').map((c) => c.file);
    expect(files[2]).toBe('/Users/u/Library/Application Support/Code/User/settings.json');
  });
});
