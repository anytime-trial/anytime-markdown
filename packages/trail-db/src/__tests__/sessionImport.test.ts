/**
 * `parseJsonlLines` / `extractSessionMetaFromLines`（`importSession` の DB に触れない部分）の
 * 特性化テスト。
 *
 * 元の `importSession` は認知的複雑度 46 で、直接呼ぶテストは 30 件あったが、いずれも
 * 「取り込めた件数」と「行の中身」を見るもので、**同じキーが複数行に異なる値で現れたとき
 * どちらを採るか**を固定していなかった。分割で「最初の値」が「最後の値」に化けても
 * 検知できない状態だったため、その条件を明示的に置く。
 */
import { extractSessionMetaFromLines, parseJsonlLines } from "../sessionImport";
import type { RawLine } from "../rawLine";

const TS1 = "2026-08-03T01:00:00.000Z";
const TS2 = "2026-08-03T02:00:00.000Z";

function line(over: Partial<RawLine> = {}): RawLine {
  return { type: "user", ...over };
}

describe("parseJsonlLines", () => {
  it("空文字なら空配列", () => {
    expect(parseJsonlLines("")).toEqual([]);
  });

  it("空行・空白のみの行は飛ばす", () => {
    expect(parseJsonlLines('\n  \n{"type":"user"}\n\n')).toEqual([{ type: "user" }]);
  });

  it("壊れた行は捨て、前後の行は取り込む", () => {
    expect(parseJsonlLines('{"type":"user"}\n{壊れ\n{"type":"assistant"}')).toEqual([
      { type: "user" },
      { type: "assistant" },
    ]);
  });

  it("全行が壊れていれば空配列（例外にしない）", () => {
    expect(parseJsonlLines("{壊れ\nもっと壊れ")).toEqual([]);
  });

  it("JSON として妥当なら配列やスカラーでも受ける（後段が type で弾く）", () => {
    expect(parseJsonlLines("123")).toEqual([123]);
  });
});

describe("extractSessionMetaFromLines — 取り込む行の選別", () => {
  it("行が無ければすべて空", () => {
    expect(extractSessionMetaFromLines([])).toEqual({
      sessionId: "",
      slug: "",
      version: "",
      model: "",
      entrypoint: "",
      startTime: "",
      endTime: "",
      messageCount: 0,
      messagesToInsert: [],
    });
  });

  it.each(["file-history-snapshot", "last-prompt", "queue-operation"])(
    "type=%s は取り込まず件数にも数えない",
    (type) => {
      const meta = extractSessionMetaFromLines([line({ type }), line({ type: "user" })]);
      expect(meta.messageCount).toBe(1);
      expect(meta.messagesToInsert).toEqual([{ type: "user" }]);
    },
  );

  it("type が無い行は取り込まない", () => {
    const meta = extractSessionMetaFromLines([{ sessionId: "s" }, line()]);
    expect(meta.messageCount).toBe(1);
  });

  it("isMeta が true の行は取り込まない（false / 未指定は取り込む）", () => {
    const meta = extractSessionMetaFromLines([
      line({ isMeta: true }),
      line({ isMeta: false }),
      line(),
    ]);
    expect(meta.messageCount).toBe(2);
  });

  it("除外された行のメタ情報は採らない", () => {
    const meta = extractSessionMetaFromLines([
      line({ type: "last-prompt", sessionId: "skipped", slug: "skipped" }),
      line({ isMeta: true, sessionId: "meta", slug: "meta" }),
      line({ sessionId: "kept", slug: "kept-slug" }),
    ]);
    expect(meta.sessionId).toBe("kept");
    expect(meta.slug).toBe("kept-slug");
  });

  it("messageCount は取り込んだ行数と一致する", () => {
    const meta = extractSessionMetaFromLines([line(), line(), line({ type: "last-prompt" })]);
    expect(meta.messageCount).toBe(meta.messagesToInsert.length);
  });
});

describe("extractSessionMetaFromLines — メタ情報は最初の値を採る", () => {
  it.each(["sessionId", "slug", "version", "entrypoint"] as const)(
    "%s は最初に現れた非空の値を採り、後の行で上書きしない",
    (field) => {
      const meta = extractSessionMetaFromLines([
        line({ [field]: "first" }),
        line({ [field]: "second" }),
      ]);
      expect(meta[field]).toBe("first");
    },
  );

  it("空文字の行は「無い」と同じ扱いで、後の行の値を採る", () => {
    const meta = extractSessionMetaFromLines([line({ slug: "" }), line({ slug: "later" })]);
    expect(meta.slug).toBe("later");
  });

  it("model は message.model から採り、最初の値を保つ", () => {
    const meta = extractSessionMetaFromLines([
      line({ message: { content: "x" } }),
      line({ message: { model: "opus" } }),
      line({ message: { model: "haiku" } }),
    ]);
    expect(meta.model).toBe("opus");
  });

  it("値が 1 件も現れなければ空文字（undefined にしない）", () => {
    const meta = extractSessionMetaFromLines([line()]);
    expect(meta.model).toBe("");
    expect(meta.sessionId).toBe("");
  });
});

describe("extractSessionMetaFromLines — 時刻", () => {
  it("startTime は最初・endTime は最後のタイムスタンプ", () => {
    const meta = extractSessionMetaFromLines([line({ timestamp: TS1 }), line({ timestamp: TS2 })]);
    expect(meta.startTime).toBe(TS1);
    expect(meta.endTime).toBe(TS2);
  });

  it("UTC へ正規化する（ローカル表記の入力）", () => {
    const meta = extractSessionMetaFromLines([line({ timestamp: "2026-08-03T10:00:00+09:00" })]);
    expect(meta.startTime).toBe("2026-08-03T01:00:00.000Z");
    expect(meta.endTime).toBe("2026-08-03T01:00:00.000Z");
  });

  it("解釈できない timestamp はそのまま残す（行は捨てない）", () => {
    const meta = extractSessionMetaFromLines([line({ timestamp: "not-a-date" })]);
    expect(meta.startTime).toBe("not-a-date");
    expect(meta.messageCount).toBe(1);
  });

  it("timestamp の無い行は endTime を消さない", () => {
    const meta = extractSessionMetaFromLines([line({ timestamp: TS1 }), line()]);
    expect(meta.endTime).toBe(TS1);
  });

  it("1 件も timestamp が無ければ startTime / endTime とも空文字", () => {
    const meta = extractSessionMetaFromLines([line(), line()]);
    expect(meta.startTime).toBe("");
    expect(meta.endTime).toBe("");
  });

  it("除外される行の timestamp は採らない", () => {
    const meta = extractSessionMetaFromLines([
      line({ type: "file-history-snapshot", timestamp: TS1 }),
      line({ timestamp: TS2 }),
    ]);
    expect(meta.startTime).toBe(TS2);
    expect(meta.endTime).toBe(TS2);
  });
});
