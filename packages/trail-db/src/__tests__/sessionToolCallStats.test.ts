/**
 * `analyzeSessionToolCallRows`（セッションの tool_calls 行 → 編集・やり直し・ビルド/テスト回数）の
 * 特性化テスト。
 *
 * 直接呼ぶテストは 1 本も無かった（実測）。50 行に認知的複雑度 57 が詰まっており、
 * 集計の取りこぼしは「数字が少し小さい」形でしか現れないため、分割前に振る舞いを固定する。
 *
 * 分割の前後で **期待値を変えずに** 対象だけ差し替えられるよう、呼び出しは下の `analyze` に集約する。
 */
import { analyzeSessionToolCallRows } from "../sessionToolCallStats";

type Stats = ReturnType<typeof analyzeSessionToolCallRows>;

const ZERO: Stats = {
  totalEdits: 0,
  totalRetries: 0,
  totalBuildRuns: 0,
  totalBuildFails: 0,
  totalTestRuns: 0,
  totalTestFails: 0,
};

function analyze(rows: unknown[][]): Stats {
  return analyzeSessionToolCallRows(rows);
}

/** 1 行 = [session_id, tool_calls(JSON), tool_result]。 */
function row(sessionId: string, calls: unknown, toolResult: unknown = null): unknown[] {
  return [sessionId, typeof calls === "string" ? calls : JSON.stringify(calls), toolResult];
}

describe("analyzeSessionToolCallRows", () => {
  it("行が無ければすべて 0", () => {
    expect(analyze([])).toEqual(ZERO);
  });

  describe("不正な入力は行ごと捨てる（他の行は数える）", () => {
    it("tool_calls が JSON として壊れている行は無視する", () => {
      const result = analyze([
        row("s1", "{壊れた"),
        row("s1", [{ name: "Edit", input: { file_path: "a.ts" } }]),
      ]);
      expect(result.totalEdits).toBe(1);
    });

    it("tool_calls が配列でない行は無視する", () => {
      const result = analyze([
        row("s1", { name: "Edit" }),
        row("s1", [{ name: "Write", input: { file_path: "a.ts" } }]),
      ]);
      expect(result.totalEdits).toBe(1);
    });

    it("input が無い呼び出しでも落ちない", () => {
      const result = analyze([row("s1", [{ name: "Edit" }, { name: "Bash" }])]);
      expect(result.totalEdits).toBe(1);
      expect(result.totalBuildRuns).toBe(0);
    });
  });

  describe("編集回数", () => {
    it("Edit と Write の両方を数える", () => {
      const result = analyze([
        row("s1", [
          { name: "Edit", input: { file_path: "a.ts" } },
          { name: "Write", input: { file_path: "b.ts" } },
          { name: "Read", input: { file_path: "c.ts" } },
        ]),
      ]);
      expect(result.totalEdits).toBe(2);
    });

    it("file_path が無い編集も編集回数には入る（やり直し判定には入らない）", () => {
      const result = analyze([
        row("s1", [{ name: "Edit" }, { name: "Edit" }, { name: "Edit" }]),
      ]);
      expect(result.totalEdits).toBe(3);
      expect(result.totalRetries).toBe(0);
    });
  });

  describe("やり直し（同一セッション内で同じファイルを繰り返し編集した回数）", () => {
    it("同一セッション・同一ファイルの 3 回目までで 2 回のやり直し", () => {
      const result = analyze([
        row("s1", [{ name: "Edit", input: { file_path: "a.ts" } }]),
        row("s1", [{ name: "Edit", input: { file_path: "a.ts" } }]),
        row("s1", [{ name: "Write", input: { file_path: "a.ts" } }]),
      ]);
      expect(result.totalRetries).toBe(2);
    });

    it("セッションが違えば同じファイルでもやり直しにしない", () => {
      const result = analyze([
        row("s1", [{ name: "Edit", input: { file_path: "a.ts" } }]),
        row("s2", [{ name: "Edit", input: { file_path: "a.ts" } }]),
      ]);
      expect(result.totalEdits).toBe(2);
      expect(result.totalRetries).toBe(0);
    });

    it("ファイルが違えばやり直しにしない", () => {
      const result = analyze([
        row("s1", [
          { name: "Edit", input: { file_path: "a.ts" } },
          { name: "Edit", input: { file_path: "b.ts" } },
        ]),
      ]);
      expect(result.totalRetries).toBe(0);
    });
  });

  describe("ビルド / テストの実行と失敗", () => {
    it.each([
      ["npm run build", "build"],
      ["npx tsc --noEmit", "build"],
      ["tsc -p .", "build"],
      ["webpack --mode production", "build"],
      ["vite build", "build"],
      ["esbuild src/index.ts", "build"],
      ["rollup -c", "build"],
      ["jest src/foo", "test"],
      ["vitest run", "test"],
      ["npm run test", "test"],
      ["npm test", "test"],
      ["npx jest", "test"],
    ])("%s は %s として数える", (cmd, kind) => {
      const result = analyze([row("s1", [{ name: "Bash", input: { command: cmd } }])]);
      expect(kind === "build" ? result.totalBuildRuns : result.totalTestRuns).toBe(1);
      expect(kind === "build" ? result.totalTestRuns : result.totalBuildRuns).toBe(0);
    });

    it("ビルドとテストの両方に一致するコマンドは両方に数える", () => {
      const result = analyze([
        row("s1", [{ name: "Bash", input: { command: "npm run build && npm test" } }]),
      ]);
      expect(result.totalBuildRuns).toBe(1);
      expect(result.totalTestRuns).toBe(1);
    });

    it("どちらにも一致しないコマンドは数えない", () => {
      const result = analyze([row("s1", [{ name: "Bash", input: { command: "git status" } }])]);
      expect(result.totalBuildRuns).toBe(0);
      expect(result.totalTestRuns).toBe(0);
    });

    it.each(["npm ERR! code 1", "exit code 2", "non-zero exit", "Command failed: tsc"])(
      "tool_result が %s なら失敗として数える",
      (toolResult) => {
        const result = analyze([
          row("s1", [{ name: "Bash", input: { command: "npm run build" } }], toolResult),
        ]);
        expect(result.totalBuildRuns).toBe(1);
        expect(result.totalBuildFails).toBe(1);
      },
    );

    it("exit code 0 は失敗にしない", () => {
      const result = analyze([
        row("s1", [{ name: "Bash", input: { command: "npm test" } }], "exit code 0"),
      ]);
      expect(result.totalTestRuns).toBe(1);
      expect(result.totalTestFails).toBe(0);
    });

    it("tool_result が null なら失敗にしない", () => {
      const result = analyze([
        row("s1", [{ name: "Bash", input: { command: "npm run build" } }], null),
      ]);
      expect(result.totalBuildFails).toBe(0);
    });

    it("失敗判定は行単位。同じ行の build と test は両方失敗になる", () => {
      const result = analyze([
        row(
          "s1",
          [
            { name: "Bash", input: { command: "npm run build" } },
            { name: "Bash", input: { command: "npm test" } },
          ],
          "Command failed",
        ),
      ]);
      expect(result.totalBuildFails).toBe(1);
      expect(result.totalTestFails).toBe(1);
    });

    it("tool_result が BLOB（Uint8Array）でも UTF-8 デコードして判定する", () => {
      const blob = new TextEncoder().encode("npm ERR! build failed");
      const result = analyze([
        row("s1", [{ name: "Bash", input: { command: "npm run build" } }], blob),
      ]);
      expect(result.totalBuildFails).toBe(1);
    });
  });

  it("複数セッション・複数種別が混在しても独立に集計する", () => {
    const result = analyze([
      row("s1", [
        { name: "Edit", input: { file_path: "a.ts" } },
        { name: "Bash", input: { command: "npm run build" } },
      ]),
      row("s1", [{ name: "Edit", input: { file_path: "a.ts" } }]),
      row("s2", [{ name: "Bash", input: { command: "npx jest" } }], "exit code 1"),
    ]);
    expect(result).toEqual({
      totalEdits: 2,
      totalRetries: 1,
      totalBuildRuns: 1,
      totalBuildFails: 0,
      totalTestRuns: 1,
      totalTestFails: 1,
    });
  });
});
