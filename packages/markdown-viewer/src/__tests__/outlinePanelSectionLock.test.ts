/**
 * OutlinePanel の確定セクションロック UI リグレッションテスト（S4 受入で顕在化した 2 バグ）。
 * 1. hover reveal: moveBtns の opacity をインライン style に置くと注入シートの
 *    `:hover { opacity:1 }` が永久に効かない（vanilla-ui-conventions §3）
 * 2. 再描画: ロック切替（見出し不変・SECTION_LOCK_REFRESH_META のみの tr）が
 *    見出しシグネチャガードを素通りし、ロックボタン表示が古いまま固着する
 */
import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";
import { createOutlinePanel } from "../components-vanilla/OutlinePanel";
import { SECTION_LOCK_REFRESH_META } from "../extensions/sectionLockPlugin";

function buildPanel() {
  const editor = new Editor({
    extensions: [StarterKit],
    content: "<h1>T</h1><h2>設計</h2><p>本文。</p>",
  });
  let locks: Array<{ headingIndex: number; tampered: boolean }> = [];
  const panel = createOutlinePanel({
    editor,
    t: (k: string) => k,
    outlineWidth: 240,
    editorHeight: 600,
    onOutlineClick: () => {},
    hideResize: true,
    getSectionLocks: () => locks,
    onToggleSectionLock: () => {},
    canToggleSectionLock: () => true,
  });
  document.body.appendChild(panel.el);
  return {
    editor,
    panel,
    setLocks: (next: typeof locks) => {
      locks = next;
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

it("moveBtns の opacity はインライン style に置かない（hover reveal をシートに委ねる）", () => {
  const { panel } = buildPanel();
  const moveBtns = panel.el.querySelector<HTMLElement>(".am-outline-move-btns");
  expect(moveBtns).not.toBeNull();
  expect(moveBtns?.style.opacity).toBe("");
  panel.destroy();
});

it("SECTION_LOCK_REFRESH_META のみの transaction でロックボタン表示が更新される", () => {
  const { editor, panel, setLocks } = buildPanel();
  expect(
    panel.el.querySelectorAll('[data-am-outline-lock="locked"]').length,
  ).toBe(0);

  setLocks([{ headingIndex: 1, tampered: false }]);
  // ロック切替は見出しを変えない（frontmatter のみ）→ refresh meta が再描画トリガ
  editor.view.dispatch(editor.state.tr.setMeta(SECTION_LOCK_REFRESH_META, true));

  expect(
    panel.el.querySelectorAll('[data-am-outline-lock="locked"]').length,
  ).toBe(1);
  panel.destroy();
  editor.destroy();
});
