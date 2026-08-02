/**
 * utils/commentStateSubscription.ts（再発防止 H1 の共有プリミティブ）のユニットテスト。
 *
 * 重点:
 * - `transaction` を購読すること（`update` ではない）。
 * - コメント状態 or docChanged の変化時のみ cb する（無関係な tr では cb しない）。
 * - シグネチャが衝突しないこと（text に `|` / `:` を含んでも別状態を区別する）。
 */

import {
  onCommentStateChange,
  commentStateSignature,
} from "../utils/commentStateSubscription";
import type { InlineComment } from "../utils/commentHelpers";
import { commentDataPluginKey } from "../extensions/commentExtension";

interface MockEditor {
  comments: Map<string, InlineComment>;
  subscribedEvents: string[];
  listeners: Array<(props?: unknown) => void>;
  emit: (props?: { transaction?: { docChanged?: boolean } }) => void;
  state: unknown;
  on: (event: string, fn: (props?: unknown) => void) => void;
  off: (event: string, fn: (props?: unknown) => void) => void;
}

function makeEditor(initial: InlineComment[] = []): MockEditor {
  const comments = new Map<string, InlineComment>();
  for (const c of initial) comments.set(c.id, c);
  const listeners: Array<(props?: unknown) => void> = [];
  const subscribedEvents: string[] = [];
  return {
    comments,
    subscribedEvents,
    listeners,
    emit: (props) => listeners.forEach((fn) => fn(props)),
    state: { __pluginState: { comments } },
    on: (event, fn) => {
      subscribedEvents.push(event);
      listeners.push(fn);
    },
    off: (_event, fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}

const comment = (over: Partial<InlineComment> = {}): InlineComment => ({
  id: "c1",
  text: "hello",
  resolved: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  jest
    .spyOn(commentDataPluginKey, "getState")
    .mockImplementation((s: unknown) => (s as { __pluginState?: unknown }).__pluginState);
});

afterEach(() => jest.restoreAllMocks());

function ed(e: MockEditor): Parameters<typeof onCommentStateChange>[0] {
  return e as unknown as Parameters<typeof onCommentStateChange>[0];
}

describe("commentStateSignature", () => {
  it("text に区切り文字（| / :）を含んでも別状態を区別する（衝突しない）", () => {
    const a = makeEditor([comment({ id: "a", resolved: false, text: "x" })]);
    // 連結方式（`${id}:${r}:${text}`）だと衝突しうる組み合わせ。
    const b = makeEditor([comment({ id: "a", resolved: true, text: "0:x" })]);
    expect(commentStateSignature(ed(a))).not.toBe(commentStateSignature(ed(b)));
  });

  it("挿入順が違っても同一集合なら同一シグネチャ（id ソート）", () => {
    const a = makeEditor([comment({ id: "a" }), comment({ id: "b" })]);
    const b = makeEditor([comment({ id: "b" }), comment({ id: "a" })]);
    expect(commentStateSignature(ed(a))).toBe(commentStateSignature(ed(b)));
  });

  it("空は安定値 []", () => {
    expect(commentStateSignature(ed(makeEditor()))).toBe("[]");
  });
});

describe("onCommentStateChange", () => {
  it("update ではなく transaction を購読する", () => {
    const e = makeEditor();
    const dispose = onCommentStateChange(ed(e), () => {});
    expect(e.subscribedEvents).toEqual(["transaction"]);
    dispose();
  });

  it("コメント状態（resolved）が変わると cb する（doc 非変更でも）", () => {
    const e = makeEditor([comment({ id: "x", resolved: false })]);
    let calls = 0;
    const dispose = onCommentStateChange(ed(e), () => (calls += 1));
    e.comments.set("x", comment({ id: "x", resolved: true }));
    e.emit({ transaction: { docChanged: false } });
    expect(calls).toBe(1);
    dispose();
  });

  it("docChanged のときは cb する", () => {
    const e = makeEditor([comment({ id: "x" })]);
    let calls = 0;
    const dispose = onCommentStateChange(ed(e), () => (calls += 1));
    e.emit({ transaction: { docChanged: true } });
    expect(calls).toBe(1);
    dispose();
  });

  it("コメントも doc も不変なら cb しない", () => {
    const e = makeEditor([comment({ id: "x" })]);
    let calls = 0;
    const dispose = onCommentStateChange(ed(e), () => (calls += 1));
    e.emit({ transaction: { docChanged: false } });
    expect(calls).toBe(0);
    dispose();
  });

  it("appendedTransactions の docChanged でも cb する", () => {
    const e = makeEditor([comment({ id: "x" })]);
    let calls = 0;
    const dispose = onCommentStateChange(ed(e), () => (calls += 1));
    e.emit({
      transaction: { docChanged: false },
      appendedTransactions: [{ docChanged: true }],
    } as { transaction?: { docChanged?: boolean } });
    expect(calls).toBe(1);
    dispose();
  });

  it("dispose 後は cb しない", () => {
    const e = makeEditor([comment({ id: "x" })]);
    let calls = 0;
    const dispose = onCommentStateChange(ed(e), () => (calls += 1));
    dispose();
    expect(e.listeners.length).toBe(0);
    e.comments.set("y", comment({ id: "y" }));
    e.emit({ transaction: { docChanged: true } });
    expect(calls).toBe(0);
  });
});
