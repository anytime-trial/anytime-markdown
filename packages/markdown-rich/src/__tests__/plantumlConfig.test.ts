import { extractPlantUmlConfig, mergePlantUmlConfig } from "../utils/plantumlConfig";

describe("extractPlantUmlConfig", () => {
  test("設定行がないコードはconfigが空でbodyがそのまま返る", () => {
    const code = "Alice -> Bob: Hello\nBob -> Alice: Hi";
    const result = extractPlantUmlConfig(code);
    expect(result.config).toBe("");
    expect(result.body).toBe(code);
  });

  test("skinparam行がconfigとして抽出される", () => {
    const code = "skinparam backgroundColor #EEEBDC\nAlice -> Bob: Hello";
    const result = extractPlantUmlConfig(code);
    expect(result.config).toBe("skinparam backgroundColor #EEEBDC");
    expect(result.body).toBe("Alice -> Bob: Hello");
  });

  test("!theme行がconfigとして抽出される", () => {
    const code = "!theme cerulean\nAlice -> Bob: Hello";
    const result = extractPlantUmlConfig(code);
    expect(result.config).toBe("!theme cerulean");
    expect(result.body).toBe("Alice -> Bob: Hello");
  });

  test("複数種類の設定行が混在していてもすべて抽出される", () => {
    const code =
      "skinparam backgroundColor #EEEBDC\n!theme cerulean\n!define ICONURL\nAlice -> Bob: Hello";
    const result = extractPlantUmlConfig(code);
    expect(result.config).toBe(
      "skinparam backgroundColor #EEEBDC\n!theme cerulean\n!define ICONURL",
    );
    expect(result.body).toBe("Alice -> Bob: Hello");
  });

  test("先頭の空行はスキップされる", () => {
    const code = "\n\nskinparam backgroundColor #EEEBDC\nAlice -> Bob: Hello";
    const result = extractPlantUmlConfig(code);
    expect(result.config).toBe("skinparam backgroundColor #EEEBDC");
    expect(result.body).toBe("Alice -> Bob: Hello");
  });

  test("設定行とbodyの間の空行はスキップされる", () => {
    const code = "skinparam backgroundColor #EEEBDC\n\nAlice -> Bob: Hello";
    const result = extractPlantUmlConfig(code);
    expect(result.config).toBe("skinparam backgroundColor #EEEBDC");
    expect(result.body).toBe("Alice -> Bob: Hello");
  });
});

describe("mergePlantUmlConfig", () => {
  test("configが空文字列の場合はbodyのみ返る", () => {
    const body = "Alice -> Bob: Hello";
    expect(mergePlantUmlConfig("", body)).toBe(body);
  });

  test("configが空白文字のみの場合はbodyのみ返る", () => {
    const body = "Alice -> Bob: Hello";
    expect(mergePlantUmlConfig("  \n  ", body)).toBe(body);
  });

  test("configが非空の場合はconfig + 空行 + bodyで結合される", () => {
    const config = "skinparam backgroundColor #EEEBDC";
    const body = "Alice -> Bob: Hello";
    expect(mergePlantUmlConfig(config, body)).toBe(
      "skinparam backgroundColor #EEEBDC\n\nAlice -> Bob: Hello",
    );
  });
});

describe("ラウンドトリップ", () => {
  test("extractしてmergeすると元のコンテンツが保持される", () => {
    const original =
      "skinparam backgroundColor #EEEBDC\n!theme cerulean\n\nAlice -> Bob: Hello\nBob -> Alice: Hi";
    const { config, body } = extractPlantUmlConfig(original);
    const merged = mergePlantUmlConfig(config, body);
    expect(merged).toBe(original);
  });
});
