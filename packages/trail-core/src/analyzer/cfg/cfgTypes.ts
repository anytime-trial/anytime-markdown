// packages/trail-core/src/analyzer/cfg/cfgTypes.ts
//
// 言語非依存の制御フロー中間表現 (CFG-IR)。ts.Node を含まないプレーンデータで、
// 言語別抽出器 (TsCfgExtractor / 将来 PythonCfgExtractor) が生成し、言語非依存の
// 射影 (flowGraphFromCfg / 将来 sequenceStepsFromCfg) が消費する。
//
// R1 では truncation を flow 形式に合わせて事前適用した文字列を格納する
// (condition=slice40 / label=slice40 / exprText=slice30 / rawText=slice30+'…')。
// calls/args は sequence 射影 (R2) 専用だが抽出器は R1 で完全に populate する。

export interface CfgFunction {
  /** 関数本体を持つか。false の場合 body は空で、flow は start→end のみを出力する。 */
  readonly hasBody: boolean;
  readonly body: CfgBlock;
}

export interface CfgBlock {
  readonly stmts: readonly CfgStmt[];
}

export type CfgStmt =
  | {
      readonly kind: 'if';
      readonly line: number;
      readonly condition: string;
      readonly then: CfgBlock;
      readonly else?: CfgBlock;
    }
  | {
      readonly kind: 'loop';
      readonly line: number;
      readonly loopKind: 'for' | 'forIn' | 'forOf' | 'while' | 'do';
      readonly rawText: string;
      readonly condition: string;
      readonly body: CfgBlock;
    }
  | {
      readonly kind: 'try';
      readonly line: number;
      readonly body: CfgBlock;
      readonly catch?: CfgBlock;
      readonly finally?: CfgBlock;
    }
  | { readonly kind: 'return'; readonly line: number; readonly exprText?: string }
  | { readonly kind: 'throw'; readonly line: number; readonly exprText: string }
  | { readonly kind: 'expr'; readonly line: number; readonly label: string; readonly calls: readonly CfgCall[] }
  | { readonly kind: 'other'; readonly line: number; readonly label: string; readonly calls: readonly CfgCall[] };

export interface CfgCall {
  /** identifier 呼び出しなら関数名、property access なら末尾名。解決不能は null。 */
  readonly calleeName: string | null;
  readonly isPropertyAccess: boolean;
  /** property access の receiver テキスト (sequence の iterator メソッド loop 条件用)。 */
  readonly receiverText?: string;
  readonly line: number;
  readonly args: readonly CfgArg[];
}

export type CfgArg =
  | { readonly kind: 'call'; readonly call: CfgCall }
  | { readonly kind: 'functionBody'; readonly body: CfgBlock }
  | { readonly kind: 'plain'; readonly calls: readonly CfgCall[] };
