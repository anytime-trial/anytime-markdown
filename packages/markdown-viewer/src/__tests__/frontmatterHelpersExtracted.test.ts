import {
  extractImageSrc,
  extractValidJson,
} from "../utils/frontmatterHelpers";

describe("extractImageSrc", () => {
  it("extracts src from standard markdown image syntax", () => {
    expect(extractImageSrc("![alt text](https://example.com/image.gif)")).toBe(
      "https://example.com/image.gif",
    );
  });

  it("extracts src with empty alt text", () => {
    expect(extractImageSrc("![](path/to/image.gif)")).toBe("path/to/image.gif");
  });

  it("returns null when no image syntax is present", () => {
    expect(extractImageSrc("just some text")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractImageSrc("")).toBeNull();
  });

  it("returns null for incomplete image syntax: missing closing paren", () => {
    expect(extractImageSrc("![alt](url")).toBeNull();
  });

  it("returns null for incomplete image syntax: missing ](", () => {
    expect(extractImageSrc("![alt text")).toBeNull();
  });

  it("handles image with leading text on the same line", () => {
    expect(extractImageSrc("prefix ![alt](image.png) suffix")).toBe("image.png");
  });
});

describe("extractValidJson", () => {
  it("extracts valid JSON object", () => {
    const result = extractValidJson('<!-- gif-settings: {"speed": 1} -->');
    expect(result).toBe('{"speed": 1}');
  });

  it("returns null for invalid JSON", () => {
    expect(extractValidJson('<!-- gif-settings: {broken -->'))
      .toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractValidJson("")).toBeNull();
  });

  it("returns null when no braces are present", () => {
    expect(extractValidJson("no json here")).toBeNull();
  });

  it("extracts JSON even with surrounding text", () => {
    const result = extractValidJson('prefix {"key": "value"} suffix');
    expect(result).toBe('{"key": "value"}');
  });

  it("returns null when opening brace comes after closing", () => {
    expect(extractValidJson("} stuff {")).toBeNull();
  });

  it("handles nested JSON objects", () => {
    const result = extractValidJson('{"a": {"b": 1}}');
    expect(result).toBe('{"a": {"b": 1}}');
  });
});
