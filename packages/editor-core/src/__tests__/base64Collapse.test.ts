import { collapseBase64, restoreBase64 } from "../utils/base64Collapse";

// ---------- collapseBase64 ----------
describe("collapseBase64", () => {
  test("base64画像を含まないテキストはそのまま返す", () => {
    const text = "# Hello\n\n![img](https://example.com/img.png)\n";
    const { displayText, tokenMap } = collapseBase64(text);
    expect(displayText).toBe(text);
    expect(tokenMap.size).toBe(0);
  });

  test("base64画像をトークンに置換する", () => {
    const text = '![screenshot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)';
    const { displayText, tokenMap, tokenSpans } = collapseBase64(text);
    expect(displayText).toBe("![screenshot](data:base64-image-0)");
    expect(tokenMap.size).toBe(1);
    expect(tokenMap.get("data:base64-image-0")).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
    );
    expect(tokenSpans).toEqual([{ start: 14, end: 33 }]);
  });

  test("複数のbase64画像を連番トークンに置換する", () => {
    const text = [
      "![a](data:image/png;base64,AAAA)",
      "some text",
      "![b](data:image/jpeg;base64,BBBB)",
    ].join("\n");
    const { displayText, tokenMap } = collapseBase64(text);
    expect(displayText).toBe(
      "![a](data:base64-image-0)\nsome text\n![b](data:base64-image-1)",
    );
    expect(tokenMap.size).toBe(2);
    expect(tokenMap.get("data:base64-image-0")).toBe("data:image/png;base64,AAAA");
    expect(tokenMap.get("data:base64-image-1")).toBe("data:image/jpeg;base64,BBBB");
  });

  test("HTMLのimg srcのbase64も置換する", () => {
    const text = '<img src="data:image/png;base64,CCCC" alt="test">';
    const { displayText, tokenMap } = collapseBase64(text);
    expect(displayText).toBe('<img src="data:base64-image-0" alt="test">');
    expect(tokenMap.get("data:base64-image-0")).toBe("data:image/png;base64,CCCC");
  });

  test("通常のdata: URLは置換しない", () => {
    const text = "![icon](data:image/svg+xml,%3Csvg%3E%3C/svg%3E)";
    const { displayText } = collapseBase64(text);
    expect(displayText).toBe(text);
  });
});

// ---------- restoreBase64 ----------
describe("restoreBase64", () => {
  test("トークンを元のbase64データに復元する", () => {
    const tokenMap = new Map([
      ["data:base64-image-0", "data:image/png;base64,iVBORw0KGgo"],
    ]);
    const displayText = "![img](data:base64-image-0)";
    expect(restoreBase64(displayText, tokenMap)).toBe(
      "![img](data:image/png;base64,iVBORw0KGgo)",
    );
  });

  test("複数トークンを復元する", () => {
    const tokenMap = new Map([
      ["data:base64-image-0", "data:image/png;base64,AAAA"],
      ["data:base64-image-1", "data:image/jpeg;base64,BBBB"],
    ]);
    const displayText = "![a](data:base64-image-0)\n![b](data:base64-image-1)";
    expect(restoreBase64(displayText, tokenMap)).toBe(
      "![a](data:image/png;base64,AAAA)\n![b](data:image/jpeg;base64,BBBB)",
    );
  });

  test("トークンが削除された場合は無視する", () => {
    const tokenMap = new Map([
      ["data:base64-image-0", "data:image/png;base64,AAAA"],
    ]);
    const displayText = "# Hello\nno images here";
    expect(restoreBase64(displayText, tokenMap)).toBe("# Hello\nno images here");
  });

  test("collapseしてrestoreするとラウンドトリップする", () => {
    const original = [
      "# Title",
      "",
      "![a](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)",
      "",
      "Some text here",
      "",
      "![b](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ)",
      "",
      "End",
    ].join("\n");
    const { displayText, tokenMap } = collapseBase64(original);
    const restored = restoreBase64(displayText, tokenMap);
    expect(restored).toBe(original);
  });
});
