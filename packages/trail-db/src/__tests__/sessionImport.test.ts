/**
 * `parseJsonlLines` / `extractSessionMetaFromLines`（`importSession` の DB に触れない部分）の
 * 特性化テスト。
 *
 * 元の `importSession` は認知的複雑度 46 で、直接呼ぶテストは 30 件あったが、いずれも
 * 「取り込めた件数」と「行の中身」を見るもので、**同じキーが複数行に異なる値で現れたとき
 * どちらを採るか**を固定していなかった。分割で「最初の値」が「最後の値」に化けても
 * 検知できない状態だったため、その条件を明示的に置く。
 */
import { buildMessageInsertParams, extractSessionMetaFromLines, parseJsonlLines } from "../sessionImport";
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

/**
 * `buildMessageInsertParams` の特性化テスト。
 *
 * 直接呼ぶテストは 1 本も無かった。列は 34 個あり、**取り違えても型は通る**（すべて
 * `unknown[]`）。取り込み経路の統合テストは行数しか見ていないため、変異注入では
 * 「`toolUseResult` の null を JSON 文字列化する」が 88 スイート全体を素通りした。
 */
describe("buildMessageInsertParams", () => {
  const SESSION = { sessionId: "s1", isSubagent: false, fileSubagentType: null };

  /** 列順そのものが振る舞い（INSERT_MESSAGE と 1 対 1）なので、代表 1 件は配列全体を固定する。 */
  it("assistant メッセージの列を並び順ごと固定する", () => {
    const params = buildMessageInsertParams(
      {
        uuid: "u1",
        parentUuid: "p1",
        type: "assistant",
        timestamp: "2026-08-03T10:00:00+09:00",
        cwd: "/repo",
        gitBranch: "develop",
        durationMs: 120,
        requestId: "req-1",
        isSidechain: true,
        message: {
          model: "claude-opus-5",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "hi" }],
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_read_input_tokens: 3,
            cache_creation_input_tokens: 4,
            service_tier: "standard",
            speed: "fast",
          },
        },
      },
      SESSION,
    );

    expect(params).toEqual([
      "u1", "s1", "p1",
      "assistant", null,
      "hi", null, null, null,
      "claude-opus-5", "req-1", "end_turn",
      10, 2, 3, 4, "standard", "fast",
      "2026-08-03T01:00:00.000Z", 1, 0,
      "/repo", "develop",
      120, null, null, null,
      null, null, null,
      null, null,
      null, null,
    ]);
  });

  it("欠けている項目は既定値で埋める（トークンは 0・その他は null）", () => {
    const params = buildMessageInsertParams({ type: "user" }, SESSION);
    expect(params[0]).toBe("");
    expect(params.slice(12, 16)).toEqual([0, 0, 0, 0]);
    expect(params[18]).toBe("");
    expect(params.slice(19, 21)).toEqual([0, 0]);
  });

  it("本文は assistant からだけ取り、user の文字列 content は別の列へ入る", () => {
    const assistant = buildMessageInsertParams(
      { type: "assistant", message: { content: [{ type: "text", text: "a" }] } },
      SESSION,
    );
    expect([assistant[5], assistant[6]]).toEqual(["a", null]);

    const user = buildMessageInsertParams({ type: "user", message: { content: "q" } }, SESSION);
    expect([user[5], user[6]]).toEqual([null, "q"]);
  });

  describe("tool_use_result", () => {
    it("user の content から tool_result ブロックだけを取り出す", () => {
      const params = buildMessageInsertParams(
        {
          type: "user",
          message: {
            content: [
              { type: "text", text: "ignored" },
              { type: "tool_result", tool_use_id: "t1", content: "out" },
            ] as never,
          },
        },
        SESSION,
      );
      expect(JSON.parse(params[8] as string)).toEqual([
        { type: "tool_result", tool_use_id: "t1", content: "out" },
      ]);
    });

    it("tool_result が無ければ toolUseResult へ退避する（文字列はそのまま）", () => {
      const params = buildMessageInsertParams(
        { type: "user", toolUseResult: "raw output" },
        SESSION,
      );
      expect(params[8]).toBe("raw output");
    });

    it("toolUseResult がオブジェクトなら JSON 文字列にする", () => {
      const params = buildMessageInsertParams({ type: "user", toolUseResult: { a: 1 } }, SESSION);
      expect(params[8]).toBe('{"a":1}');
    });

    it("toolUseResult が null / undefined なら null（文字列 \"null\" にしない）", () => {
      expect(buildMessageInsertParams({ type: "user", toolUseResult: null }, SESSION)[8]).toBeNull();
      expect(buildMessageInsertParams({ type: "user" }, SESSION)[8]).toBeNull();
    });

    it("tool_use_result の長さからトークン数を見積もる（4 文字 ≒ 1 トークン）", () => {
      const params = buildMessageInsertParams({ type: "user", toolUseResult: "12345" }, SESSION);
      expect(params[24]).toBe(2);
      expect(buildMessageInsertParams({ type: "user" }, SESSION)[24]).toBeNull();
    });
  });

  describe("system_command", () => {
    it.each([
      ["compact_boundary", "/compact"],
      ["local_command", "/clear"],
    ])("subtype=%s は %s として記録する", (subtype, expected) => {
      expect(buildMessageInsertParams({ type: "system", subtype }, SESSION)[32]).toBe(expected);
    });

    it("その他の subtype なら null", () => {
      expect(buildMessageInsertParams({ type: "system", subtype: "other" }, SESSION)[32]).toBeNull();
    });
  });

  describe("subagent_type", () => {
    // tool_calls は id / name / input の 3 項目へ正規化される（id が先頭）
    const agentCall = JSON.stringify([
      { id: "i", name: "Agent", input: { description: "d", model: "m", subagent_type: "explorer" } },
    ]);

    it("主セッションでは Agent tool_use の subagent_type を採る", () => {
      const params = buildMessageInsertParams(
        { type: "assistant", message: { content: [{ type: "tool_use", id: "i", name: "Agent", input: { description: "d", model: "m", subagent_type: "explorer" } }] } },
        SESSION,
      );
      expect(params[33]).toBe("explorer");
      expect([params[25], params[26]]).toEqual(["d", "m"]);
      expect(params[7]).toBe(agentCall);
    });

    it("サブエージェント JSONL では meta.json 由来の値を全メッセージへ付ける", () => {
      const params = buildMessageInsertParams(
        { type: "user", message: { content: "q" } },
        { sessionId: "s1", isSubagent: true, fileSubagentType: "code-reviewer" },
      );
      expect(params[33]).toBe("code-reviewer");
    });

    it("サブエージェント JSONL で meta.json が無ければ null のまま", () => {
      const params = buildMessageInsertParams(
        { type: "assistant", message: { content: [{ type: "tool_use", id: "i", name: "Agent", input: { subagent_type: "explorer" } }] } },
        { sessionId: "s1", isSubagent: true, fileSubagentType: null },
      );
      expect(params[33]).toBeNull();
    });
  });
});
