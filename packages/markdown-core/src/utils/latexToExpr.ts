import { parse, type MathNode } from "mathjs";

/** グラフ種別 */
export type GraphType =
  | "explicit2d" // y = f(x)
  | "parametric2d" // x = f(t), y = g(t)
  | "polar" // r = f(θ)
  | "implicit2d" // F(x,y) = 0
  | "surface3d" // z = f(x,y)
  | "parametric3d" // x=f(u,v), y=g(u,v), z=h(u,v)
  | "unknown";

/** パース結果 */
export interface GraphExpr {
  type: GraphType;
  /** 評価関数。引数は種別に依存 */
  evaluate: (vars: Record<string, number>) => number | Record<string, number>;
  /** 検出されたパラメータ（スライダー生成用） */
  parameters: string[];
  /** 変数名（x, t, θ, u, v など） */
  variables: string[];
  /** 元のLaTeX文字列 */
  latex: string;
  /** エラーメッセージ（type === "unknown" の場合） */
  error?: string;
}

/** 既知の変数名セット（パラメータとして除外しない） */
const KNOWN_VARIABLES = new Set([
  "x",
  "y",
  "z",
  "t",
  "theta",
  "u",
  "v",
  "r",
]);

/** 定数名（変数から除外） */
const CONSTANTS = new Set(["pi", "e", "i"]);

/** 数学関数名（変数から除外） */
const MATH_FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "sqrt",
  "abs",
  "log",
  "log10",
  "exp",
  "ceil",
  "floor",
  "round",
  "sign",
  "max",
  "min",
  "pow",
]);

/**
 * LaTeX文字列をmath.js互換の式文字列に変換する
 */
export function latexToMathjs(latex: string): string {
  let expr = latex;

  // \left, \right, \, を除去
  expr = expr.replace(/\\left/g, "");
  expr = expr.replace(/\\right/g, "");
  expr = expr.replace(/\\,/g, " ");

  // \frac{a}{b} → ((a)/(b))
  // ネストに対応するため繰り返し適用
  let prev = "";
  while (prev !== expr) {
    prev = expr;
    expr = expr.replace(
      /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/,
      "(($1)/($2))"
    );
  }

  // \sqrt{x} → sqrt(x)
  expr = expr.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, "sqrt($1)");

  // 三角関数・対数関数
  expr = expr.replace(/\\sin/g, "sin");
  expr = expr.replace(/\\cos/g, "cos");
  expr = expr.replace(/\\tan/g, "tan");
  expr = expr.replace(/\\asin/g, "asin");
  expr = expr.replace(/\\acos/g, "acos");
  expr = expr.replace(/\\atan/g, "atan");
  expr = expr.replace(/\\sinh/g, "sinh");
  expr = expr.replace(/\\cosh/g, "cosh");
  expr = expr.replace(/\\tanh/g, "tanh");
  expr = expr.replace(/\\ln/g, "log");
  expr = expr.replace(/\\log/g, "log10");
  expr = expr.replace(/\\exp/g, "exp");

  // 定数
  expr = expr.replace(/\\pi/g, "pi");
  expr = expr.replace(/\\theta/g, "theta");

  // 演算子
  expr = expr.replace(/\\cdot/g, "*");
  expr = expr.replace(/\\times/g, "*");

  // {} → ()
  expr = expr.replace(/\{/g, "(");
  expr = expr.replace(/\}/g, ")");

  // 暗黙の乗算: 数字の直後に英字が来る場合
  expr = expr.replace(/(\d)([a-zA-Z])/g, "$1*$2");

  // 閉じ括弧の直後に英字または開き括弧が来る場合の暗黙の乗算
  expr = expr.replace(/\)([a-zA-Z])/g, ")*$1");
  expr = expr.replace(/\)\(/g, ")*(");

  // 不要な空白を正規化
  expr = expr.replace(/\s+/g, " ").trim();

  return expr;
}

/**
 * math.js ASTから変数名を抽出する（定数・関数名を除外）
 */
export function extractVariables(node: MathNode): string[] {
  const vars = new Set<string>();

  function walk(n: MathNode): void {
    if (n.type === "SymbolNode") {
      const name = (n as MathNode & { name: string }).name;
      if (!CONSTANTS.has(name) && !MATH_FUNCTIONS.has(name)) {
        vars.add(name);
      }
    }
    // FunctionNode: 関数名は除外、引数のみ走査
    if (n.type === "FunctionNode") {
      const fn = n as MathNode & { args: MathNode[] };
      for (const arg of fn.args) {
        walk(arg);
      }
      return;
    }
    // その他のノードの子要素を走査
    n.forEach((child: MathNode) => {
      walk(child);
    });
  }

  walk(node);
  return Array.from(vars).sort();
}

/**
 * \begin{cases}...\end{cases} 環境をパースして個別の方程式に分割する
 */
export function parseCasesEnv(
  latex: string
): { lhs: string; rhs: string }[] | null {
  const casesMatch = latex.match(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/
  );
  if (!casesMatch) return null;

  const body = casesMatch[1];
  const lines = body.split("\\\\").map((l) => l.trim()).filter(Boolean);

  const equations: { lhs: string; rhs: string }[] = [];
  for (const line of lines) {
    const eqMatch = line.match(/^([^=]+)=(.+)$/);
    if (!eqMatch) return null;
    equations.push({
      lhs: eqMatch[1].trim(),
      rhs: eqMatch[2].trim(),
    });
  }

  return equations.length > 0 ? equations : null;
}

/**
 * explicit2d: y = f(x)
 */
function buildExplicit2d(
  rhsExpr: string,
  latex: string,
  allVars: string[]
): GraphExpr {
  const compiled = parse(rhsExpr).compile();
  const variables = allVars.filter((v) => KNOWN_VARIABLES.has(v));
  const parameters = allVars.filter(
    (v) => !KNOWN_VARIABLES.has(v)
  );

  return {
    type: "explicit2d",
    evaluate: (vars) => compiled.evaluate(vars) as number,
    parameters,
    variables,
    latex,
  };
}

/**
 * polar: r = f(θ)
 */
function buildPolar(
  rhsExpr: string,
  latex: string,
  allVars: string[]
): GraphExpr {
  const compiled = parse(rhsExpr).compile();
  const variables = allVars.filter((v) => KNOWN_VARIABLES.has(v));
  const parameters = allVars.filter(
    (v) => !KNOWN_VARIABLES.has(v)
  );

  return {
    type: "polar",
    evaluate: (vars) => compiled.evaluate(vars) as number,
    parameters,
    variables,
    latex,
  };
}

/**
 * surface3d: z = f(x, y)
 */
function buildSurface3d(
  rhsExpr: string,
  latex: string,
  allVars: string[]
): GraphExpr {
  const compiled = parse(rhsExpr).compile();
  const variables = allVars.filter((v) => KNOWN_VARIABLES.has(v));
  const parameters = allVars.filter(
    (v) => !KNOWN_VARIABLES.has(v)
  );

  return {
    type: "surface3d",
    evaluate: (vars) => compiled.evaluate(vars) as number,
    parameters,
    variables,
    latex,
  };
}

/**
 * implicit2d: F(x, y) = 0 形式
 * lhs - rhs = 0 として評価
 */
function buildImplicit2d(
  lhsExpr: string,
  rhsExpr: string,
  latex: string,
  allVars: string[]
): GraphExpr {
  const lhsCompiled = parse(lhsExpr).compile();
  const rhsCompiled = parse(rhsExpr).compile();
  const variables = allVars.filter((v) => KNOWN_VARIABLES.has(v));
  const parameters = allVars.filter(
    (v) => !KNOWN_VARIABLES.has(v)
  );

  return {
    type: "implicit2d",
    evaluate: (vars) =>
      (lhsCompiled.evaluate(vars) as number) -
      (rhsCompiled.evaluate(vars) as number),
    parameters,
    variables,
    latex,
  };
}

/**
 * cases環境からパラメトリックグラフを構築
 */
function parseCasesGraph(
  equations: { lhs: string; rhs: string }[],
  latex: string
): GraphExpr {
  const mapping: Record<string, string> = {};
  for (const eq of equations) {
    const lhs = latexToMathjs(eq.lhs).trim();
    const rhs = latexToMathjs(eq.rhs);
    mapping[lhs] = rhs;
  }

  const hasX = "x" in mapping;
  const hasY = "y" in mapping;
  const hasZ = "z" in mapping;

  if (hasX && hasY && hasZ) {
    // parametric3d
    const compiledX = parse(mapping["x"]).compile();
    const compiledY = parse(mapping["y"]).compile();
    const compiledZ = parse(mapping["z"]).compile();

    const allVarSet = new Set<string>();
    for (const rhs of Object.values(mapping)) {
      for (const v of extractVariables(parse(rhs))) {
        allVarSet.add(v);
      }
    }
    const allVars = Array.from(allVarSet).sort();
    const variables = allVars.filter((v) => KNOWN_VARIABLES.has(v));
    const parameters = allVars.filter((v) => !KNOWN_VARIABLES.has(v));

    return {
      type: "parametric3d",
      evaluate: (vars) => ({
        x: compiledX.evaluate(vars) as number,
        y: compiledY.evaluate(vars) as number,
        z: compiledZ.evaluate(vars) as number,
      }),
      parameters,
      variables,
      latex,
    };
  }

  if (hasX && hasY) {
    // parametric2d
    const compiledX = parse(mapping["x"]).compile();
    const compiledY = parse(mapping["y"]).compile();

    const allVarSet = new Set<string>();
    for (const rhs of Object.values(mapping)) {
      for (const v of extractVariables(parse(rhs))) {
        allVarSet.add(v);
      }
    }
    const allVars = Array.from(allVarSet).sort();
    const variables = allVars.filter((v) => KNOWN_VARIABLES.has(v));
    const parameters = allVars.filter((v) => !KNOWN_VARIABLES.has(v));

    return {
      type: "parametric2d",
      evaluate: (vars) => ({
        x: compiledX.evaluate(vars) as number,
        y: compiledY.evaluate(vars) as number,
      }),
      parameters,
      variables,
      latex,
    };
  }

  return {
    type: "unknown",
    evaluate: () => 0,
    parameters: [],
    variables: [],
    latex,
    error: "cases環境にx, yの定義が見つかりません",
  };
}

/**
 * LaTeX文字列を解析してGraphExprを返すメインエントリポイント
 */
export function parseLatexToGraph(latex: string): GraphExpr {
  try {
    // cases環境の検出
    const casesEqs = parseCasesEnv(latex);
    if (casesEqs) {
      return parseCasesGraph(casesEqs, latex);
    }

    // 等号で分割
    const eqParts = latex.split("=");
    if (eqParts.length < 2) {
      return {
        type: "unknown",
        evaluate: () => 0,
        parameters: [],
        variables: [],
        latex,
        error: "等号が見つかりません",
      };
    }

    const lhs = eqParts[0].trim();
    const rhs = eqParts.slice(1).join("=").trim();

    const lhsMathjs = latexToMathjs(lhs);
    const rhsMathjs = latexToMathjs(rhs);

    // RHSの変数を抽出
    const rhsNode = parse(rhsMathjs);
    const rhsVars = extractVariables(rhsNode);

    // LHSの変数も抽出（implicit2d判定用）
    const lhsNode = parse(lhsMathjs);
    const lhsVars = extractVariables(lhsNode);

    const allVars = Array.from(new Set([...lhsVars, ...rhsVars])).sort();

    // y = f(x) → explicit2d
    if (lhsMathjs.trim() === "y") {
      return buildExplicit2d(rhsMathjs, latex, rhsVars);
    }

    // r = f(θ) → polar
    if (lhsMathjs.trim() === "r") {
      return buildPolar(rhsMathjs, latex, rhsVars);
    }

    // z = f(x, y) → surface3d
    if (lhsMathjs.trim() === "z") {
      return buildSurface3d(rhsMathjs, latex, rhsVars);
    }

    // LHS/RHSの両方にx, yが含まれる → implicit2d
    if (allVars.includes("x") && allVars.includes("y")) {
      return buildImplicit2d(lhsMathjs, rhsMathjs, latex, allVars);
    }

    return {
      type: "unknown",
      evaluate: () => 0,
      parameters: [],
      variables: [],
      latex,
      error: "グラフ種別を判定できません",
    };
  } catch (err) {
    return {
      type: "unknown",
      evaluate: () => 0,
      parameters: [],
      variables: [],
      latex,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
