import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";
import {
  computeSectionHash,
  listSections,
  upsertLockedSection,
} from "@anytime-markdown/section-lock-core";
import {
  SECTION_LOCK_REFRESH_META,
  computeSectionLockState,
  createSectionLockPlugin,
  type SectionLockUiEntry,
} from "../extensions/sectionLockPlugin";

const BODY = "# T\n\n## 設計\n\n本文。\n\n## 運用\n\n自由。\n";

function lockedFullText(sectionPath: string, body = BODY): string {
  const section = listSections(body).find((s) => s.path === sectionPath && s.occurrence === 1);
  if (!section) throw new Error(`section not found: ${sectionPath}`);
  return upsertLockedSection(body, {
    path: sectionPath,
    occurrence: 1,
    hash: computeSectionHash(body, section),
    lockedAt: "2026-07-17T04:00:00.000Z",
    lockedBy: "tester",
  });
}

describe("computeSectionLockState", () => {
  it("ロックエントリを見出しインデックスへ対応づける", () => {
    const full = lockedFullText("T > 設計");
    const { ui } = computeSectionLockState(full);
    expect(ui).toEqual([
      { headingIndex: 1, path: "T > 設計", occurrence: 1, tampered: false },
    ]);
  });

  it("ロック外経路の変更（hash 不一致）は tampered", () => {
    const full = lockedFullText("T > 設計").replace("本文。", "改変済み。");
    const { ui } = computeSectionLockState(full);
    expect(ui[0]?.tampered).toBe(true);
  });

  it("ロック無しは空", () => {
    expect(computeSectionLockState(BODY).ui).toEqual([]);
  });
});

describe("createSectionLockPlugin (実 Editor)", () => {
  function buildEditor(ui: SectionLockUiEntry[]): {
    editor: Editor;
    setUi: (next: SectionLockUiEntry[]) => void;
  } {
    let state = ui;
    const editor = new Editor({
      extensions: [StarterKit],
      content: "<h1>T</h1><h2>設計</h2><p>本文。</p><h2>運用</h2><p>自由。</p>",
    });
    editor.registerPlugin(createSectionLockPlugin(() => state));
    return {
      editor,
      setUi: (next) => {
        state = next;
        editor.view.dispatch(editor.state.tr.setMeta(SECTION_LOCK_REFRESH_META, true));
      },
    };
  }

  const LOCK_DESIGN: SectionLockUiEntry[] = [
    { headingIndex: 1, path: "T > 設計", occurrence: 1, tampered: false },
  ];

  function textOf(editor: Editor): string {
    return editor.state.doc.textContent;
  }

  it("ロック節内への挿入をブロックする", () => {
    const { editor } = buildEditor(LOCK_DESIGN);
    const before = textOf(editor);
    // 「本文。」段落 = ロック節（設計セクション）内
    const pos = editor.state.doc.resolve(0);
    void pos;
    const paraPos = findTextPos(editor, "本文。");
    editor.commands.insertContentAt(paraPos, "X");
    expect(textOf(editor)).toBe(before);
  });

  it("非ロック節への挿入は通す", () => {
    const { editor } = buildEditor(LOCK_DESIGN);
    const paraPos = findTextPos(editor, "自由。");
    editor.commands.insertContentAt(paraPos, "X");
    expect(textOf(editor)).toContain("X自由。");
  });

  it("ロック解除（状態更新 + refresh meta）後は編集できる", () => {
    const { editor, setUi } = buildEditor(LOCK_DESIGN);
    setUi([]);
    const paraPos = findTextPos(editor, "本文。");
    editor.commands.insertContentAt(paraPos, "X");
    expect(textOf(editor)).toContain("X本文。");
  });

  it("ロック節の見出し・ブロックに data-am-section-lock 装飾が付く", () => {
    const { editor } = buildEditor(LOCK_DESIGN);
    const lockedEls = editor.view.dom.querySelectorAll('[data-am-section-lock="locked"]');
    expect(lockedEls.length).toBeGreaterThanOrEqual(2); // h2 設計 + 本文段落
    const tamperedEls = editor.view.dom.querySelectorAll('[data-am-section-lock="tampered"]');
    expect(tamperedEls.length).toBe(0);
  });

  it("tampered は tampered 装飾になる", () => {
    const { editor } = buildEditor([{ ...LOCK_DESIGN[0], tampered: true }]);
    const tamperedEls = editor.view.dom.querySelectorAll('[data-am-section-lock="tampered"]');
    expect(tamperedEls.length).toBeGreaterThanOrEqual(2);
  });
});

/** doc 内の text を含む最初の位置（テキスト先頭）を返す。 */
function findTextPos(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text?.includes(text)) {
      found = pos + (node.text ?? "").indexOf(text);
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`text not found: ${text}`);
  return found;
}
