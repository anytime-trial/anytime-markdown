/**
 * utils/commentNotifications.ts の購読 seam のユニットテスト。
 *
 * 重点: resolve / 削除 など doc 非変更（meta のみ）のトランザクションでも onCommentsChange が
 * 発火すること（拡張のネイティブコメント UI が更新されない退行の防止）。vendored tiptap は
 * doc 変更時しか `update` を emit しないため、`transaction` 購読が必須。
 */

import { installCommentNotifications } from "../utils/commentNotifications";
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
  const pluginState = { comments };
  const doc = { descendants: (_fn: unknown) => {} };
  return {
    comments,
    subscribedEvents,
    listeners,
    emit: (props) => listeners.forEach((fn) => fn(props)),
    state: { doc, __pluginState: pluginState },
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
  jest.useFakeTimers();
  jest
    .spyOn(commentDataPluginKey, "getState")
    .mockImplementation((s: unknown) => (s as { __pluginState?: unknown }).__pluginState);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function install(editor: MockEditor, onChange: (c: unknown[]) => void): () => void {
  return installCommentNotifications(
    editor as unknown as Parameters<typeof installCommentNotifications>[0],
    onChange,
  );
}

describe("installCommentNotifications", () => {
  it("update ではなく transaction を購読する", () => {
    const editor = makeEditor();
    const dispose = install(editor, () => {});
    expect(editor.subscribedEvents).toContain("transaction");
    expect(editor.subscribedEvents).not.toContain("update");
    dispose();
  });

  it("初回はデバウンス経由で通知する", () => {
    const editor = makeEditor([comment({ id: "x" })]);
    const calls: unknown[][] = [];
    const dispose = install(editor, (c) => calls.push(c));
    expect(calls.length).toBe(0);
    jest.runOnlyPendingTimers();
    expect(calls.length).toBe(1);
    dispose();
  });

  it("resolve（doc 非変更）でも onCommentsChange が発火する", () => {
    const editor = makeEditor([comment({ id: "x", resolved: false })]);
    const calls: unknown[][] = [];
    const dispose = install(editor, (c) => calls.push(c));
    jest.runOnlyPendingTimers(); // 初回
    calls.length = 0;
    // resolve をシミュレート（resolved のみ変更・doc 不変）。
    editor.comments.set("x", comment({ id: "x", resolved: true }));
    editor.emit({ transaction: { docChanged: false } });
    jest.runOnlyPendingTimers();
    expect(calls.length).toBe(1);
    dispose();
  });

  it("orphan コメント削除（doc 非変更）でも onCommentsChange が発火する", () => {
    const editor = makeEditor([comment({ id: "x" })]);
    const calls: unknown[][] = [];
    const dispose = install(editor, (c) => calls.push(c));
    jest.runOnlyPendingTimers();
    calls.length = 0;
    // Map から削除のみ（doc にマーク無し = orphan）。
    editor.comments.delete("x");
    editor.emit({ transaction: { docChanged: false } });
    jest.runOnlyPendingTimers();
    expect(calls.length).toBe(1);
    dispose();
  });

  it("コメントも doc も不変の transaction では通知しない", () => {
    const editor = makeEditor([comment({ id: "x" })]);
    const calls: unknown[][] = [];
    const dispose = install(editor, (c) => calls.push(c));
    jest.runOnlyPendingTimers();
    calls.length = 0;
    editor.emit({ transaction: { docChanged: false } });
    jest.runOnlyPendingTimers();
    expect(calls.length).toBe(0);
    dispose();
  });

  it("doc 変更時は通知する（通常編集）", () => {
    const editor = makeEditor([comment({ id: "x" })]);
    const calls: unknown[][] = [];
    const dispose = install(editor, (c) => calls.push(c));
    jest.runOnlyPendingTimers();
    calls.length = 0;
    editor.emit({ transaction: { docChanged: true } });
    jest.runOnlyPendingTimers();
    expect(calls.length).toBe(1);
    dispose();
  });

  it("dispose 後は通知しない", () => {
    const editor = makeEditor([comment({ id: "x" })]);
    const calls: unknown[][] = [];
    const dispose = install(editor, (c) => calls.push(c));
    jest.runOnlyPendingTimers();
    calls.length = 0;
    dispose();
    expect(editor.listeners.length).toBe(0);
    editor.comments.set("y", comment({ id: "y" }));
    editor.emit({ transaction: { docChanged: true } });
    jest.runOnlyPendingTimers();
    expect(calls.length).toBe(0);
  });
});
