/**
 * markdown-engine computeDiff / computeSemanticDiff のユニットテスト。
 * レビュー指摘 29（markdown-engine にユニットテストが皆無）対応。
 * ドキュメント化された仕様が無いため、実挙動を観測して固定する characterization test。
 * markdown-engine は test 基盤を持たないため、markdown-viewer の jest 基盤
 * （moduleNameMapper で @anytime-markdown/markdown-engine → 実ソース）に載せる。
 */
import { computeDiff, computeSemanticDiff } from "@anytime-markdown/markdown-engine";

describe("computeDiff - 基本4ケース（追加/削除/変更/無変更）", () => {
  test("無変更のみの入力は blocks が空で全行 equal になる", () => {
    const text = "a\nb\n";
    const result = computeDiff(text, text);
    expect(result.blocks).toEqual([]);
    expect(result.leftLines.every((l) => l.type === "equal")).toBe(true);
    expect(result.rightLines.every((l) => l.type === "equal")).toBe(true);
  });

  test("行の変更（modified）は modified-old / modified-new のペアと type: modified の block になる", () => {
    const result = computeDiff("a\nb\nc\n", "a\nB\nc\n");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: "modified",
      leftLines: ["b"],
      rightLines: ["B"],
    });
    const changedLeft = result.leftLines.find((l) => l.text === "b");
    const changedRight = result.rightLines.find((l) => l.text === "B");
    expect(changedLeft?.type).toBe("modified-old");
    expect(changedRight?.type).toBe("modified-new");
  });

  test("行の追加（added）は右側のみに type: added の行と block が現れる", () => {
    const result = computeDiff("a\nb\n", "a\nb\nc\n");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: "added",
      leftLines: [],
      rightLines: ["c"],
    });
    const added = result.rightLines.find((l) => l.text === "c");
    expect(added?.type).toBe("added");
  });

  test("行の削除（removed）は左側のみに type: removed の行と block が現れる", () => {
    const result = computeDiff("a\nb\nc\n", "a\nb\n");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: "removed",
      leftLines: ["c"],
      rightLines: [],
    });
    const removed = result.leftLines.find((l) => l.text === "c");
    expect(removed?.type).toBe("removed");
  });

  test("追加・削除・変更が混在する入力を1回で処理できる", () => {
    const result = computeDiff("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({ type: "modified", leftLines: ["b"], rightLines: ["B"] });
    expect(result.blocks[1]).toMatchObject({ type: "added", leftLines: [], rightLines: ["d"] });
  });
});

describe("computeDiff - 空入力・同一入力の境界値", () => {
  test("両方空文字列は空の結果を返す", () => {
    expect(computeDiff("", "")).toEqual({ leftLines: [], rightLines: [], blocks: [] });
  });

  test("同一入力（複数行）は blocks 空・全行 equal", () => {
    const result = computeDiff("a\nb\n", "a\nb\n");
    expect(result.blocks).toEqual([]);
    expect(result.leftLines).toHaveLength(2);
    expect(result.rightLines).toHaveLength(2);
  });

  test("片方が空文字列はもう片方が全行 added/removed になる", () => {
    const result = computeDiff("", "a\nb\n");
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe("added");
    expect(result.blocks[0].rightLines).toEqual(["a", "b"]);
  });
});

describe("computeSemanticDiff - 基本4ケース（見出しベース）", () => {
  test("無変更のみの入力は blocks が空", () => {
    const text = "# H1\ntext1\n\n# H2\ntext2\n";
    const result = computeSemanticDiff(text, text);
    expect(result.blocks).toEqual([]);
  });

  test("見出しテキストが変わるセクションは丸ごと removed+added として扱われる（セクション単位の観測挙動）", () => {
    const left = "# H1\ntext1\n\n# H2\ntext2\n";
    const right = "# H1\ntext1\n\n# H3\ntext2\n";
    const result = computeSemanticDiff(left, right);
    const types = result.blocks.map((b) => b.type);
    expect(types).toEqual(["removed", "added"]);
    expect(result.blocks[0].leftLines).toEqual(["# H2", "text2", ""]);
    expect(result.blocks[1].rightLines).toEqual(["# H3", "text2", ""]);
  });

  test("見出しが無い入力は computeDiff 相当の行単位フォールバックになる", () => {
    const left = "a\nb\nc\n";
    const right = "a\nB\nc\n";
    const semantic = computeSemanticDiff(left, right);
    const plain = computeDiff(left, right);
    expect(semantic).toEqual(plain);
  });

  test("片方のみ見出しがある場合はフォールバックせずセクション単位で removed+added になる（observed）", () => {
    // フォールバック条件は「両方に見出しが無い」場合のみ（leftHasHeadings || rightHasHeadings で非フォールバック）。
    // 見出しの有無が非対称だとセクション対応が取れず、行単位の類似性に関わらず
    // 左を丸ごと removed・右を丸ごと added として扱う（computeDiff とは異なる結果になる）。
    const left = "a\nb\n";
    const right = "# H1\na\nb\n";
    const result = computeSemanticDiff(left, right);
    expect(result).not.toEqual(computeDiff(left, right));
    expect(result.blocks.map((b) => b.type)).toEqual(["removed", "added"]);
    expect(result.blocks[0]).toMatchObject({ type: "removed", leftLines: ["a", "b", ""], rightLines: [] });
    expect(result.blocks[1]).toMatchObject({ type: "added", leftLines: [], rightLines: ["# H1", "a", "b", ""] });
  });
});

describe("computeSemanticDiff - 空入力・同一入力の境界値", () => {
  test("両方空文字列は空の結果を返す（見出しパースを経由せず早期リターン）", () => {
    expect(computeSemanticDiff("", "")).toEqual({ leftLines: [], rightLines: [], blocks: [] });
  });

  test("同一の見出し付き入力は blocks 空", () => {
    const text = "# H1\ntext1\n";
    const result = computeSemanticDiff(text, text);
    expect(result.blocks).toEqual([]);
  });

  test("片方が空文字列は見出し付きもう片方が全て added として扱われる", () => {
    const result = computeSemanticDiff("", "# H1\ntext1\n");
    expect(result.blocks.every((b) => b.type === "added")).toBe(true);
  });
});
