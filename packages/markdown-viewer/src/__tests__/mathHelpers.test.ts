import {
  preprocessMathBlock,
  postprocessMathBlock,
} from "../utils/mathHelpers";

/* ------------------------------------------------------------------ */
/*  preprocessMathBlock: $$...$$ → ```math ... ```                    */
/* ------------------------------------------------------------------ */
describe("preprocessMathBlock", () => {
  test("$$...$$ブロックを```mathフェンスに変換する", () => {
    const input = "text\n$$\nE=mc^2\n$$\nmore";
    const expected = "text\n```math\nE=mc^2\n```\nmore";
    expect(preprocessMathBlock(input)).toBe(expected);
  });

  test("複数の$$ブロックを変換する", () => {
    const input = "$$\na+b\n$$\ntext\n$$\nc+d\n$$";
    const expected = "```math\na+b\n```\ntext\n```math\nc+d\n```";
    expect(preprocessMathBlock(input)).toBe(expected);
  });

  test("コードフェンス内の$$はスキップする", () => {
    const input = "```\n$$\nE=mc^2\n$$\n```";
    expect(preprocessMathBlock(input)).toBe(input);
  });

  test("$$が行頭でない場合はスキップする", () => {
    const input = "text $$ inline $$ end";
    expect(preprocessMathBlock(input)).toBe(input);
  });

  test("空の$$ブロックを変換する", () => {
    const input = "$$\n$$";
    const expected = "```math\n```";
    expect(preprocessMathBlock(input)).toBe(expected);
  });

  test("複数行の数式を変換する", () => {
    const input = "$$\n\\frac{a}{b}\n\\sum_{i=0}^{n}\n$$";
    const expected = "```math\n\\frac{a}{b}\n\\sum_{i=0}^{n}\n```";
    expect(preprocessMathBlock(input)).toBe(expected);
  });
});


/* ------------------------------------------------------------------ */
/*  postprocessMathBlock: ```math ... ``` → $$...$$                   */
/* ------------------------------------------------------------------ */
describe("postprocessMathBlock", () => {
  test("```mathフェンスを$$...$$に変換する", () => {
    const input = "text\n```math\nE=mc^2\n```\nmore";
    const expected = "text\n$$\nE=mc^2\n$$\nmore";
    expect(postprocessMathBlock(input)).toBe(expected);
  });

  test("他の言語のコードフェンスは変換しない", () => {
    const input = "```js\nconst x = 1;\n```";
    expect(postprocessMathBlock(input)).toBe(input);
  });

  test("複数の```mathフェンスを変換する", () => {
    const input = "```math\na\n```\ntext\n```math\nb\n```";
    const expected = "$$\na\n$$\ntext\n$$\nb\n$$";
    expect(postprocessMathBlock(input)).toBe(expected);
  });

  test("空の```mathフェンスを変換する", () => {
    const input = "```math\n```";
    const expected = "$$\n$$";
    expect(postprocessMathBlock(input)).toBe(expected);
  });
});
