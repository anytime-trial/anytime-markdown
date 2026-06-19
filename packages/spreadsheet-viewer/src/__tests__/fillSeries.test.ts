/**
 * vanilla/fillSeries（computeFillValues）のユニットテスト。
 * Excel 風フィルハンドルの補完値生成（コピー/数値連番/等差/末尾数字/循環）を検証する。
 */

import { computeFillValues } from "../vanilla/fillSeries";

describe("computeFillValues", () => {
  describe("境界", () => {
    it("count が 0 以下なら空配列", () => {
      expect(computeFillValues(["1"], 0)).toEqual([]);
      expect(computeFillValues(["1"], -1)).toEqual([]);
    });

    it("source が空なら空文字で埋める", () => {
      expect(computeFillValues([], 3)).toEqual(["", "", ""]);
    });
  });

  describe("単一セル", () => {
    it("数値は +1 連番", () => {
      expect(computeFillValues(["5"], 3)).toEqual(["6", "7", "8"]);
    });

    it("小数も +1 連番", () => {
      expect(computeFillValues(["1.5"], 2)).toEqual(["2.5", "3.5"]);
    });

    it("純粋な文字列はコピー", () => {
      expect(computeFillValues(["foo"], 3)).toEqual(["foo", "foo", "foo"]);
    });

    it("末尾数字付き文字列は末尾を +1（ゼロ埋め幅を保持）", () => {
      expect(computeFillValues(["Item1"], 2)).toEqual(["Item2", "Item3"]);
      expect(computeFillValues(["Item09"], 2)).toEqual(["Item10", "Item11"]);
    });

    it("空文字はコピー", () => {
      expect(computeFillValues([""], 2)).toEqual(["", ""]);
    });
  });

  describe("複数セル", () => {
    it("全数値は等差を検出して延長", () => {
      expect(computeFillValues(["2", "4"], 2)).toEqual(["6", "8"]);
      expect(computeFillValues(["1", "2", "3"], 2)).toEqual(["4", "5"]);
    });

    it("減少する等差も延長", () => {
      expect(computeFillValues(["10", "8"], 2)).toEqual(["6", "4"]);
    });

    it("末尾数字付き同一接頭辞は末尾を等差延長", () => {
      expect(computeFillValues(["A1", "A2"], 2)).toEqual(["A3", "A4"]);
      expect(computeFillValues(["Q1", "Q3"], 2)).toEqual(["Q5", "Q7"]);
    });

    it("非数値・混在はソースを循環コピー", () => {
      expect(computeFillValues(["x", "y"], 5)).toEqual(["x", "y", "x", "y", "x"]);
      expect(computeFillValues(["a", "1"], 3)).toEqual(["a", "1", "a"]);
    });
  });
});
