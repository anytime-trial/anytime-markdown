/**
 * Codex JSONL 正規化群（`normalizeCodexRecords` ほか）の特性化テスト。
 *
 * 直接呼ぶテストは 1 本も無かった（実測）。`normalizeCodexResponseItem` は認知的複雑度 31 で、
 * 取りこぼしは「メッセージが 1 件足りない」「tool_use の input が空」という静かな形でしか
 * 現れないため、分割前に振る舞いを固定する。
 *
 * uuid（`codex-<sessionId>-<seq>`）は取り込み経路と commit 突合経路の双方が同じ値を導く必要が
 * あるため、seq の採番規則を特に厚く固定する。
 */
import {
  applyCodexTokenCountToNormalized,
  extractCodexText,
  normalizeCodexEventMsg,
  normalizeCodexRecords,
  normalizeCodexResponseItem,
  normalizeCodexTokenUsage,
} from "../codexNormalize";
import type { RawLine } from "../rawLine";

const SID = "sess-1";
const TS = "2026-08-03T00:00:00.000Z";

/** `response_item` を 1 件だけ渡して結果を得る。normalized は既定で空。 */
function responseItem(
  payload: Record<string, unknown>,
  seq = 0,
  normalized: RawLine[] = [],
): { lines: RawLine[]; newSeq: number } {
  const payloadType = typeof payload.type === "string" ? payload.type : "";
  return normalizeCodexResponseItem(payload, payloadType, SID, TS, seq, normalized);
}

/** `message.content` のブロック配列を素の形で取り出す（型アサーションをテスト側に散らさない）。 */
function blocks(line: RawLine): Record<string, unknown>[] {
  return (line.message?.content ?? []) as unknown as Record<string, unknown>[];
}

/** rollout の 1 行を組み立てる。 */
function record(type: string, payload: Record<string, unknown>, timestamp: unknown = TS): RawLine {
  return { type, payload, timestamp: timestamp as string };
}

describe("extractCodexText", () => {
  it("配列でなければ null", () => {
    expect(extractCodexText("plain")).toBeNull();
    expect(extractCodexText(undefined)).toBeNull();
    expect(extractCodexText({ text: "x" })).toBeNull();
  });

  it("text を持つブロックだけを改行で連結する", () => {
    expect(extractCodexText([{ text: "a" }, { type: "image" }, { text: "b" }])).toBe("a\nb");
  });

  it("空白のみの text は捨てる（すべて空白なら null）", () => {
    expect(extractCodexText([{ text: "   " }, { text: "a" }])).toBe("a");
    expect(extractCodexText([{ text: "  " }, { text: "\n" }])).toBeNull();
  });

  it("null 要素・非オブジェクト要素は飛ばす", () => {
    expect(extractCodexText([null, 3, { text: "a" }])).toBe("a");
  });

  it("text が文字列でなければ捨てる", () => {
    expect(extractCodexText([{ text: 42 }])).toBeNull();
  });
});

describe("normalizeCodexTokenUsage", () => {
  it("input_tokens はキャッシュ読み込み分を差し引いた値", () => {
    expect(normalizeCodexTokenUsage({ input_tokens: 100, cached_input_tokens: 30, output_tokens: 7 })).toEqual({
      input_tokens: 70,
      output_tokens: 7,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 0,
    });
  });

  it("キャッシュ分が総量を超えても負にしない", () => {
    expect(normalizeCodexTokenUsage({ input_tokens: 10, cached_input_tokens: 40 }).input_tokens).toBe(0);
  });

  it("欠けている項目は 0 として扱う", () => {
    expect(normalizeCodexTokenUsage({})).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });

  it("cache_creation_input_tokens は Codex に無いので常に 0", () => {
    expect(
      normalizeCodexTokenUsage({ cache_creation_input_tokens: 999 }).cache_creation_input_tokens,
    ).toBe(0);
  });
});

describe("applyCodexTokenCountToNormalized", () => {
  const usage = { info: { last_token_usage: { input_tokens: 50, cached_input_tokens: 20, output_tokens: 5 } } };

  it("直近の assistant 行へ付ける（後ろから探す）", () => {
    const normalized: RawLine[] = [
      { type: "assistant", message: { content: "first" } },
      { type: "user", message: { content: "u" } },
      { type: "assistant", message: { content: "last" } },
    ];
    applyCodexTokenCountToNormalized(usage, normalized);
    expect(normalized[2].message?.usage?.input_tokens).toBe(30);
    expect(normalized[0].message?.usage).toBeUndefined();
  });

  it("既存の message フィールドを保つ", () => {
    const normalized: RawLine[] = [{ type: "assistant", message: { content: "keep", model: "m" } }];
    applyCodexTokenCountToNormalized(usage, normalized);
    expect(normalized[0].message?.content).toBe("keep");
    expect(normalized[0].message?.model).toBe("m");
  });

  it("assistant 行が無ければ何もしない", () => {
    const normalized: RawLine[] = [{ type: "user", message: { content: "u" } }];
    applyCodexTokenCountToNormalized(usage, normalized);
    expect(normalized[0].message?.usage).toBeUndefined();
  });

  it("info が無い / last_token_usage が無い / normalized が空なら何もしない", () => {
    const normalized: RawLine[] = [{ type: "assistant", message: { content: "a" } }];
    applyCodexTokenCountToNormalized({}, normalized);
    applyCodexTokenCountToNormalized({ info: {} }, normalized);
    expect(normalized[0].message?.usage).toBeUndefined();
    expect(() => applyCodexTokenCountToNormalized(usage, [])).not.toThrow();
  });
});

describe("normalizeCodexEventMsg", () => {
  it("task_started は行を作らず seq も進めない", () => {
    expect(normalizeCodexEventMsg({ type: "task_started" }, [], 3, SID, TS)).toEqual({ lines: [], newSeq: 3 });
  });

  it("token_count は行を作らず、直近の assistant 行へ usage を付ける", () => {
    const normalized: RawLine[] = [{ type: "assistant", message: { content: "a" } }];
    const result = normalizeCodexEventMsg(
      { type: "token_count", info: { last_token_usage: { input_tokens: 8 } } },
      normalized,
      3,
      SID,
      TS,
    );
    expect(result).toEqual({ lines: [], newSeq: 3 });
    expect(normalized[0].message?.usage?.input_tokens).toBe(8);
  });

  it("agent_message は assistant 行 1 件を作り seq を 1 進める", () => {
    const result = normalizeCodexEventMsg({ type: "agent_message", message: "hi" }, [], 4, SID, TS);
    expect(result.newSeq).toBe(5);
    expect(result.lines).toEqual([
      { uuid: "codex-sess-1-4", sessionId: SID, type: "assistant", timestamp: TS, message: { content: "hi" } },
    ]);
  });

  it("agent_message でも message が文字列でなければ行を作らない", () => {
    expect(normalizeCodexEventMsg({ type: "agent_message", message: { a: 1 } }, [], 4, SID, TS)).toEqual({
      lines: [],
      newSeq: 4,
    });
  });

  it("未知の event 種別は行を作らない", () => {
    expect(normalizeCodexEventMsg({ type: "whatever" }, [], 4, SID, TS)).toEqual({ lines: [], newSeq: 4 });
  });
});

describe("normalizeCodexResponseItem — message", () => {
  it("role=user は user 行、subtype に元の role を残す", () => {
    const { lines, newSeq } = responseItem({ type: "message", role: "user", content: [{ text: "q" }] }, 2);
    expect(newSeq).toBe(3);
    expect(lines).toEqual([
      {
        uuid: "codex-sess-1-2",
        sessionId: SID,
        type: "user",
        subtype: "user",
        timestamp: TS,
        message: { content: "q" },
      },
    ]);
  });

  it("role=assistant は assistant 行", () => {
    const { lines } = responseItem({ type: "message", role: "assistant", content: [{ text: "a" }] });
    expect(lines[0].type).toBe("assistant");
    expect(lines[0].subtype).toBe("assistant");
  });

  it.each(["developer", "system"])("role=%s は system 行にまとめる（subtype で区別する）", (role) => {
    const { lines } = responseItem({ type: "message", role, content: [{ text: "s" }] });
    expect(lines[0].type).toBe("system");
    expect(lines[0].subtype).toBe(role);
  });

  it("role が想定外なら行を作らず seq も進めない", () => {
    expect(responseItem({ type: "message", role: "tool", content: [{ text: "x" }] }, 5)).toEqual({
      lines: [],
      newSeq: 5,
    });
    expect(responseItem({ type: "message", content: [{ text: "x" }] }, 5)).toEqual({ lines: [], newSeq: 5 });
  });

  it("本文が取れなければ空文字にする（null にしない）", () => {
    const { lines } = responseItem({ type: "message", role: "user", content: "not-an-array" });
    expect(lines[0].message?.content).toBe("");
  });
});

describe("normalizeCodexResponseItem — tool 呼び出し", () => {
  it("function_call は arguments を JSON として解釈する", () => {
    const { lines, newSeq } = responseItem(
      { type: "function_call", call_id: "c1", name: "shell", arguments: '{"cmd":"ls"}' },
      1,
    );
    expect(newSeq).toBe(2);
    expect(lines[0]).toEqual({
      uuid: "codex-sess-1-1",
      sessionId: SID,
      type: "assistant",
      timestamp: TS,
      message: { content: [{ type: "tool_use", id: "c1", name: "shell", input: { cmd: "ls" } }] },
    });
  });

  it("custom_tool_call は arguments でなく input を見る", () => {
    const { lines } = responseItem({ type: "custom_tool_call", call_id: "c2", name: "t", input: '{"a":1}' });
    expect(lines[0].message?.content).toEqual([
      { type: "tool_use", id: "c2", name: "t", input: { a: 1 } },
    ]);
  });

  it("引数が JSON として壊れていても捨てず raw に退避する", () => {
    const { lines } = responseItem({ type: "function_call", call_id: "c3", name: "t", arguments: "{壊れ" });
    expect(lines[0].message?.content).toEqual([
      { type: "tool_use", id: "c3", name: "t", input: { raw: "{壊れ" } },
    ]);
  });

  it("引数がオブジェクトならそのまま使う", () => {
    const { lines } = responseItem({ type: "function_call", call_id: "c4", name: "t", arguments: { a: 1 } });
    expect(blocks(lines[0])[0].input).toEqual({ a: 1 });
  });

  it("引数が空文字・空白・欠落なら空オブジェクト", () => {
    for (const args of ["", "   ", undefined, null]) {
      const { lines } = responseItem({ type: "function_call", call_id: "c5", name: "t", arguments: args });
      expect(blocks(lines[0])[0].input).toEqual({});
    }
  });

  it("call_id が無ければ seq 由来の id を振り、name が無ければ tool にする", () => {
    const { lines } = responseItem({ type: "function_call" }, 9);
    expect(lines[0].message?.content).toEqual([
      { type: "tool_use", id: "codex-call-9", name: "tool", input: {} },
    ]);
  });
});

describe("normalizeCodexResponseItem — tool 結果", () => {
  it("function_call_output は user 行の tool_result になる", () => {
    const { lines, newSeq } = responseItem({ type: "function_call_output", call_id: "c1", output: "done" }, 7);
    expect(newSeq).toBe(8);
    expect(lines[0]).toEqual({
      uuid: "codex-sess-1-7",
      sessionId: SID,
      type: "user",
      timestamp: TS,
      message: {
        content: [{ type: "tool_result", tool_use_id: "c1", content: "done", is_error: false }],
      },
    });
  });

  it("custom_tool_call_output も同じ形にする", () => {
    const { lines } = responseItem({ type: "custom_tool_call_output", call_id: "c2", output: "x" });
    expect(blocks(lines[0])[0].type).toBe("tool_result");
  });

  it("output が文字列でなければ JSON 文字列化する", () => {
    const { lines } = responseItem({ type: "function_call_output", call_id: "c3", output: { a: 1 } });
    expect(blocks(lines[0])[0].content).toBe('{"a":1}');
  });

  it("output が欠けていれば空文字の JSON 表現になる", () => {
    const { lines } = responseItem({ type: "function_call_output", call_id: "c4" });
    expect(blocks(lines[0])[0].content).toBe('""');
  });

  it("call_id が無ければ空文字（seq 由来の id は振らない）", () => {
    const { lines } = responseItem({ type: "function_call_output", output: "x" }, 9);
    expect(blocks(lines[0])[0].tool_use_id).toBe("");
  });

  it("失敗した実行でも is_error は常に false（Codex は成否を持たない）", () => {
    const { lines } = responseItem({ type: "function_call_output", call_id: "c5", output: "error: boom" });
    expect(blocks(lines[0])[0].is_error).toBe(false);
  });
});

describe("normalizeCodexResponseItem — その他", () => {
  it("token_count は行を作らず直近の assistant 行へ usage を付ける", () => {
    const normalized: RawLine[] = [{ type: "assistant", message: { content: "a" } }];
    const result = responseItem(
      { type: "token_count", info: { last_token_usage: { input_tokens: 12, cached_input_tokens: 2 } } },
      6,
      normalized,
    );
    expect(result).toEqual({ lines: [], newSeq: 6 });
    expect(normalized[0].message?.usage?.input_tokens).toBe(10);
  });

  it("未知の payload 種別は行を作らず seq も進めない", () => {
    expect(responseItem({ type: "reasoning" }, 6)).toEqual({ lines: [], newSeq: 6 });
    expect(responseItem({}, 6)).toEqual({ lines: [], newSeq: 6 });
  });
});

describe("normalizeCodexRecords", () => {
  it("session_meta の id を sessionId に使い、cli_version を version に使う", () => {
    const result = normalizeCodexRecords(
      [record("session_meta", { id: "real-id", cli_version: "0.9.1" })],
      "fallback-id",
    );
    expect(result).toEqual({ normalized: [], sessionId: "real-id", version: "0.9.1", source: "codex" });
  });

  it("session_meta が無ければ fallback の sessionId を使い version は空", () => {
    const result = normalizeCodexRecords([record("response_item", { type: "reasoning" })], "fallback-id");
    expect(result.sessionId).toBe("fallback-id");
    expect(result.version).toBe("");
  });

  it("session_meta がファイル末尾にあっても、先頭のレコードから正しい sessionId で採番する", () => {
    const result = normalizeCodexRecords(
      [
        record("response_item", { type: "message", role: "user", content: [{ text: "q" }] }),
        record("session_meta", { id: "real-id" }),
      ],
      "fallback-id",
    );
    expect(result.normalized[0].uuid).toBe("codex-real-id-0");
    expect(result.normalized[0].sessionId).toBe("real-id");
  });

  it("seq は行を作ったレコードだけで進み、種別をまたいで連番になる", () => {
    const result = normalizeCodexRecords(
      [
        record("session_meta", { id: "s" }),
        record("response_item", { type: "message", role: "user", content: [{ text: "q" }] }),
        record("response_item", { type: "reasoning" }),
        record("event_msg", { type: "agent_message", message: "hi" }),
        record("response_item", { type: "function_call", call_id: "c", name: "t", arguments: "{}" }),
      ],
      "fallback",
    );
    expect(result.normalized.map((l) => l.uuid)).toEqual(["codex-s-0", "codex-s-1", "codex-s-2"]);
  });

  it("payload が無い / オブジェクトでないレコードは飛ばす", () => {
    const notAnObject = "str" as unknown as Record<string, unknown>;
    const result = normalizeCodexRecords(
      [
        { type: "response_item" },
        { type: "event_msg" },
        { type: "session_meta" },
        { type: "response_item", payload: notAnObject },
        { type: "session_meta", payload: notAnObject },
        record("response_item", { type: "message", role: "user", content: [{ text: "q" }] }),
      ],
      "fallback",
    );
    expect(result.normalized).toHaveLength(1);
    expect(result.sessionId).toBe("fallback");
  });

  it("response_item / event_msg / session_meta 以外の型は飛ばす", () => {
    const result = normalizeCodexRecords([record("turn_context", { type: "message", role: "user" })], "fallback");
    expect(result.normalized).toHaveLength(0);
  });

  it("timestamp が文字列でなければ空文字にする", () => {
    const result = normalizeCodexRecords(
      [record("response_item", { type: "message", role: "user", content: [{ text: "q" }] }, 12345)],
      "fallback",
    );
    expect(result.normalized[0].timestamp).toBe("");
  });

  it("cli_version が空文字なら version を上書きしない", () => {
    const result = normalizeCodexRecords(
      [record("session_meta", { id: "s", cli_version: "1.0" }), record("session_meta", { id: "s", cli_version: "" })],
      "fallback",
    );
    expect(result.version).toBe("1.0");
  });

  it("token_count は直前の assistant 行へ後付けされる（行数は増えない）", () => {
    const result = normalizeCodexRecords(
      [
        record("session_meta", { id: "s" }),
        record("response_item", { type: "message", role: "assistant", content: [{ text: "a" }] }),
        record("event_msg", { type: "token_count", info: { last_token_usage: { input_tokens: 9 } } }),
      ],
      "fallback",
    );
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0].message?.usage?.input_tokens).toBe(9);
  });
});
