import { extractMermaidConfig, mergeMermaidConfig } from "../utils/mermaidConfig";

describe("extractMermaidConfig", () => {
  test("ディレクティブなしのコードはconfigが空でbodyがそのまま返る", () => {
    const code = "graph TD\n  A --> B";
    const result = extractMermaidConfig(code);
    expect(result.config).toBe("");
    expect(result.body).toBe(code);
  });

  test("ディレクティブ付きコードからconfigとbodyを分離できる", () => {
    const code = '%%{init: {"theme":"dark"}}%%\ngraph TD\n  A --> B';
    const result = extractMermaidConfig(code);
    expect(result.config).toBe('{"theme":"dark"}');
    expect(result.body).toBe("graph TD\n  A --> B");
  });

  test("複数行にまたがるinitディレクティブを抽出できる", () => {
    const code = '%%{init:\n  {"theme":"dark",\n   "flowchart":{"curve":"basis"}}\n}%%\ngraph TD\n  A --> B';
    const result = extractMermaidConfig(code);
    expect(result.config).toBe('{"theme":"dark",\n   "flowchart":{"curve":"basis"}}');
    expect(result.body).toBe("graph TD\n  A --> B");
  });

  test("ディレクティブ後の空白が除去される", () => {
    const code = '%%{init: {"theme":"dark"}}%%  \ngraph TD';
    const result = extractMermaidConfig(code);
    expect(result.config).toBe('{"theme":"dark"}');
    expect(result.body).toBe("graph TD");
  });

  test("%%{init: で始まるが }%% がない場合はconfigが空", () => {
    const code = '%%{init: {"theme":"dark"} missing close';
    const result = extractMermaidConfig(code);
    expect(result.config).toBe("");
    expect(result.body).toBe(code);
  });

  test("空文字列を渡すとconfigが空でbodyも空になる", () => {
    const result = extractMermaidConfig("");
    expect(result.config).toBe("");
    expect(result.body).toBe("");
  });
});

describe("mergeMermaidConfig", () => {
  test("空のconfigはbodyのみ返す", () => {
    const result = mergeMermaidConfig("", "graph TD\n  A --> B");
    expect(result).toBe("graph TD\n  A --> B");
  });

  test("空オブジェクト {} のconfigはbodyのみ返す", () => {
    const result = mergeMermaidConfig("{}", "graph TD\n  A --> B");
    expect(result).toBe("graph TD\n  A --> B");
  });

  test("空白のみのconfigはbodyのみ返す", () => {
    const result = mergeMermaidConfig("   ", "graph TD\n  A --> B");
    expect(result).toBe("graph TD\n  A --> B");
  });

  test("空白付き {} のconfigはbodyのみ返す", () => {
    const result = mergeMermaidConfig("  {}  ", "graph TD\n  A --> B");
    expect(result).toBe("graph TD\n  A --> B");
  });

  test("有効なconfigはディレクティブを先頭に付与する", () => {
    const result = mergeMermaidConfig('{"theme":"dark"}', "graph TD\n  A --> B");
    expect(result).toBe('%%{init: {"theme":"dark"}}%%\ngraph TD\n  A --> B');
  });
});

describe("ラウンドトリップ", () => {
  test("extract → merge で元のコードに復元できる", () => {
    const original = '%%{init: {"theme":"dark"}}%%\ngraph TD\n  A --> B';
    const { config, body } = extractMermaidConfig(original);
    const restored = mergeMermaidConfig(config, body);
    expect(restored).toBe(original);
  });

  test("ディレクティブなしコードもラウンドトリップが成立する", () => {
    const original = "graph TD\n  A --> B";
    const { config, body } = extractMermaidConfig(original);
    const restored = mergeMermaidConfig(config, body);
    expect(restored).toBe(original);
  });
});
