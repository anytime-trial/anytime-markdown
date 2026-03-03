import {
  preprocessMathBlock,
  preprocessMathInline,
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
/*  preprocessMathInline: $...$ → <span data-math-inline>             */
/* ------------------------------------------------------------------ */
describe("preprocessMathInline", () => {
  test("$...$をdata-math-inlineスパンに変換する", () => {
    const input = "text $E=mc^2$ end";
    const expected =
      'text <span data-math-inline="E=mc^2"></span> end';
    expect(preprocessMathInline(input)).toBe(expected);
  });

  test("$$（ブロック記法）は変換しない", () => {
    const input = "$$\nE=mc^2\n$$";
    expect(preprocessMathInline(input)).toBe(input);
  });

  test("インラインコード内の$はスキップする", () => {
    const input = "text `$100` end";
    expect(preprocessMathInline(input)).toBe(input);
  });

  test("コードブロック内の$はスキップする", () => {
    const input = "```\n$E=mc^2$\n```";
    expect(preprocessMathInline(input)).toBe(input);
  });

  test("複数のインライン数式を変換する", () => {
    const input = "$a+b$ and $c+d$";
    const expected =
      '<span data-math-inline="a+b"></span> and <span data-math-inline="c+d"></span>';
    expect(preprocessMathInline(input)).toBe(expected);
  });

  test("空の$$はスキップする", () => {
    const input = "text $$ end";
    expect(preprocessMathInline(input)).toBe(input);
  });

  test("数式中のバックスラッシュを保持する", () => {
    const input = "$\\frac{a}{b}$";
    const expected =
      '<span data-math-inline="\\frac{a}{b}"></span>';
    expect(preprocessMathInline(input)).toBe(expected);
  });

  test("$の前後にスペースなし（文中埋め込み）も変換する", () => {
    const input = "式は$x^2$です";
    const expected =
      '式は<span data-math-inline="x^2"></span>です';
    expect(preprocessMathInline(input)).toBe(expected);
  });

  test("```mathフェンス内の$はスキップする", () => {
    const input = "```math\n$a$\n```";
    expect(preprocessMathInline(input)).toBe(input);
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
