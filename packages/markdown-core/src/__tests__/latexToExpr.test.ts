import {
  latexToMathjs,
  parseLatexToGraph,
  extractVariables,
  parseCasesEnv,
} from "../utils/latexToExpr";
import { parse } from "mathjs";

/* ------------------------------------------------------------------ */
/*  latexToMathjs: LaTeX → math.js 式変換                              */
/* ------------------------------------------------------------------ */
describe("latexToMathjs", () => {
  test("\\frac{1}{2} → ((1)/(2))", () => {
    expect(latexToMathjs("\\frac{1}{2}")).toBe("((1)/(2))");
  });

  test("\\sin(x) + \\cos(x) → sin(x) + cos(x)", () => {
    expect(latexToMathjs("\\sin(x) + \\cos(x)")).toBe("sin(x) + cos(x)");
  });

  test("\\sqrt{x} → sqrt(x)", () => {
    expect(latexToMathjs("\\sqrt{x}")).toBe("sqrt(x)");
  });

  test("\\cdot → *", () => {
    expect(latexToMathjs("a \\cdot b")).toBe("a * b");
  });

  test("\\times → *", () => {
    expect(latexToMathjs("a \\times b")).toBe("a * b");
  });

  test("2x → 2*x (暗黙の乗算)", () => {
    expect(latexToMathjs("2x")).toBe("2*x");
  });

  test("x^{2} → x^(2) (ブレース→括弧)", () => {
    expect(latexToMathjs("x^{2}")).toBe("x^(2)");
  });

  test("\\pi → pi", () => {
    expect(latexToMathjs("\\pi")).toBe("pi");
  });

  test("\\theta → theta", () => {
    expect(latexToMathjs("\\theta")).toBe("theta");
  });

  test("\\ln(x) → log(x)", () => {
    expect(latexToMathjs("\\ln(x)")).toBe("log(x)");
  });

  test("\\log(x) → log10(x)", () => {
    expect(latexToMathjs("\\log(x)")).toBe("log10(x)");
  });

  test("\\exp(x) → exp(x)", () => {
    expect(latexToMathjs("\\exp(x)")).toBe("exp(x)");
  });

  test("\\left(x\\right) → (x) (\\left/\\right除去)", () => {
    expect(latexToMathjs("\\left(x\\right)")).toBe("(x)");
  });

  test("\\, (薄いスペース) を空白に変換", () => {
    expect(latexToMathjs("x\\,y")).toBe("x y");
  });

  test("ネストした\\frac", () => {
    const result = latexToMathjs("\\frac{\\frac{1}{2}}{3}");
    // ネストしたfracが正しく変換される
    expect(result).toContain("((1)/(2))");
    expect(result).toContain("/(3)");
  });
});

/* ------------------------------------------------------------------ */
/*  extractVariables: AST変数抽出                                      */
/* ------------------------------------------------------------------ */
describe("extractVariables", () => {
  test("x + y から x, y を抽出", () => {
    const node = parse("x + y");
    expect(extractVariables(node)).toEqual(["x", "y"]);
  });

  test("定数 pi, e を除外", () => {
    const node = parse("x + pi + e");
    expect(extractVariables(node)).toEqual(["x"]);
  });

  test("関数名 sin を除外", () => {
    const node = parse("sin(x) + cos(y)");
    expect(extractVariables(node)).toEqual(["x", "y"]);
  });

  test("パラメータ a, b を含む", () => {
    const node = parse("a * x + b");
    expect(extractVariables(node)).toEqual(["a", "b", "x"]);
  });
});

/* ------------------------------------------------------------------ */
/*  parseCasesEnv: cases環境パース                                     */
/* ------------------------------------------------------------------ */
describe("parseCasesEnv", () => {
  test("cases環境を正しくパース", () => {
    const latex = "\\begin{cases} x = \\cos(t) \\\\ y = \\sin(t) \\end{cases}";
    const result = parseCasesEnv(latex);
    expect(result).toEqual([
      { lhs: "x", rhs: "\\cos(t)" },
      { lhs: "y", rhs: "\\sin(t)" },
    ]);
  });

  test("cases環境がない場合はnullを返す", () => {
    expect(parseCasesEnv("y = x^2")).toBeNull();
  });

  test("3つの方程式をパース", () => {
    const latex =
      "\\begin{cases} x = u \\\\ y = v \\\\ z = u + v \\end{cases}";
    const result = parseCasesEnv(latex);
    expect(result).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  parseLatexToGraph: メイン判定                                      */
/* ------------------------------------------------------------------ */
describe("parseLatexToGraph", () => {
  describe("explicit2d", () => {
    test("y = x^{2} → explicit2d, evaluate({x:3}) === 9", () => {
      const result = parseLatexToGraph("y = x^{2}");
      expect(result.type).toBe("explicit2d");
      expect(result.evaluate({ x: 3 })).toBe(9);
    });

    test("y = \\sin(x) → explicit2d, evaluate({x:0}) ≈ 0", () => {
      const result = parseLatexToGraph("y = \\sin(x)");
      expect(result.type).toBe("explicit2d");
      expect(result.evaluate({ x: 0 })).toBeCloseTo(0);
    });

    test("y = a \\cdot x^{2} → explicit2d, パラメータ a を検出", () => {
      const result = parseLatexToGraph("y = a \\cdot x^{2}");
      expect(result.type).toBe("explicit2d");
      expect(result.parameters).toContain("a");
      expect(result.evaluate({ x: 2, a: 3 })).toBe(12);
    });

    test("y = \\frac{1}{x} → explicit2d", () => {
      const result = parseLatexToGraph("y = \\frac{1}{x}");
      expect(result.type).toBe("explicit2d");
      expect(result.evaluate({ x: 2 })).toBeCloseTo(0.5);
    });
  });

  describe("polar", () => {
    test("r = 1 + \\cos(\\theta) → polar, evaluate({theta:0}) ≈ 2", () => {
      const result = parseLatexToGraph("r = 1 + \\cos(\\theta)");
      expect(result.type).toBe("polar");
      expect(result.evaluate({ theta: 0 })).toBeCloseTo(2);
    });

    test("r = \\theta → polar", () => {
      const result = parseLatexToGraph("r = \\theta");
      expect(result.type).toBe("polar");
      expect(result.evaluate({ theta: Math.PI })).toBeCloseTo(Math.PI);
    });
  });

  describe("surface3d", () => {
    test("z = \\sin(x) \\cdot \\cos(y) → surface3d", () => {
      const result = parseLatexToGraph("z = \\sin(x) \\cdot \\cos(y)");
      expect(result.type).toBe("surface3d");
      expect(result.evaluate({ x: 0, y: 0 })).toBeCloseTo(0);
    });

    test("z = x^{2} + y^{2} → surface3d", () => {
      const result = parseLatexToGraph("z = x^{2} + y^{2}");
      expect(result.type).toBe("surface3d");
      expect(result.evaluate({ x: 1, y: 1 })).toBeCloseTo(2);
    });
  });

  describe("implicit2d", () => {
    test("x^{2} + y^{2} = 1 → implicit2d, evaluate({x:1, y:0}) ≈ 0", () => {
      const result = parseLatexToGraph("x^{2} + y^{2} = 1");
      expect(result.type).toBe("implicit2d");
      expect(result.evaluate({ x: 1, y: 0 })).toBeCloseTo(0);
    });

    test("x^{2} - y = 0 → implicit2d", () => {
      const result = parseLatexToGraph("x^{2} - y = 0");
      expect(result.type).toBe("implicit2d");
      expect(result.evaluate({ x: 2, y: 4 })).toBeCloseTo(0);
    });
  });

  describe("parametric2d", () => {
    test("cases環境 x=cos(t), y=sin(t) → parametric2d", () => {
      const latex =
        "\\begin{cases} x = \\cos(t) \\\\ y = \\sin(t) \\end{cases}";
      const result = parseLatexToGraph(latex);
      expect(result.type).toBe("parametric2d");
      const val = result.evaluate({ t: 0 }) as Record<string, number>;
      expect(val.x).toBeCloseTo(1);
      expect(val.y).toBeCloseTo(0);
    });
  });

  describe("parametric3d", () => {
    test("cases環境 x=u, y=v, z=u+v → parametric3d", () => {
      const latex =
        "\\begin{cases} x = u \\\\ y = v \\\\ z = u + v \\end{cases}";
      const result = parseLatexToGraph(latex);
      expect(result.type).toBe("parametric3d");
      const val = result.evaluate({ u: 1, v: 2 }) as Record<string, number>;
      expect(val.x).toBeCloseTo(1);
      expect(val.y).toBeCloseTo(2);
      expect(val.z).toBeCloseTo(3);
    });
  });

  describe("polar", () => {
    test("r = 2\\cos(\\theta) → polar", () => {
      const result = parseLatexToGraph("r = 2 \\cdot \\cos(\\theta)");
      expect(result.type).toBe("polar");
      const val = result.evaluate({ theta: 0 });
      expect(val).toBeCloseTo(2);
    });
  });

  describe("surface3d", () => {
    test("z = x^2 + y^2 → surface3d", () => {
      const result = parseLatexToGraph("z = x^{2} + y^{2}");
      expect(result.type).toBe("surface3d");
      const val = result.evaluate({ x: 1, y: 2 });
      expect(val).toBeCloseTo(5);
    });
  });

  describe("implicit2d", () => {
    test("x^2 + y^2 = 1 → implicit2d", () => {
      const result = parseLatexToGraph("x^{2} + y^{2} = 1");
      expect(result.type).toBe("implicit2d");
      // On the circle: x=1, y=0 → 1+0-1 = 0
      const val = result.evaluate({ x: 1, y: 0 });
      expect(val).toBeCloseTo(0);
    });
  });

  describe("cases unknown", () => {
    test("cases with no x,y → unknown", () => {
      const latex = "\\begin{cases} a = 1 \\\\ b = 2 \\end{cases}";
      const result = parseLatexToGraph(latex);
      expect(result.type).toBe("unknown");
      expect(result.error).toBeDefined();
    });
  });

  describe("unknown graph type", () => {
    test("a = b → unknown (cannot determine type)", () => {
      const result = parseLatexToGraph("a = b");
      expect(result.type).toBe("unknown");
    });
  });

  describe("unknown", () => {
    test("\\sum_{k=1}^{n} k → unknown with error", () => {
      const result = parseLatexToGraph("\\sum_{k=1}^{n} k");
      expect(result.type).toBe("unknown");
      expect(result.error).toBeDefined();
    });

    test("等号がない式 → unknown", () => {
      const result = parseLatexToGraph("x^{2} + 1");
      expect(result.type).toBe("unknown");
      expect(result.error).toBeDefined();
    });
  });
});
