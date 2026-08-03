import type { Editor } from "@anytime-markdown/markdown-core";
import {
  computeSectionHash,
  listSections,
  removeLockedSection,
  upsertLockedSection,
} from "@anytime-markdown/section-lock-core";

import {
  SECTION_LOCK_REFRESH_META,
  computeSectionLockState,
  createSectionLockPlugin,
  ensureSectionLockStyles,
  type SectionLockUiEntry,
} from "../../extensions/sectionLockPlugin";
import { parseFrontmatter, prependFrontmatter } from "../../utils/frontmatterHelpers";
import { getMarkdownFromEditorSafe } from "../../utils/markdownSerializer";

/**
 * 確定セクションロック（Phase 5 S4・FR-S4-2）。
 *
 * 正本は frontmatter の `lockedSections`。serialize 済み markdown から見出しインデックスへ
 * 対応づけ、Plugin（編集ブロック + 装飾）と OutlinePanel（ロック / 解除操作）が getter で
 * 都度参照する。
 */

export interface SectionLockOptions {
  readonly editor: Editor;
  /** 現在の frontmatter（mount 後に変化するため getter）。 */
  readonly getFrontmatter: () => string | null;
  readonly setFrontmatter: (next: string | null, opts: { autoExpand: boolean }) => void;
  readonly markDirty: () => void;
  readonly saveContent: (produce: () => string | null) => void;
}

export interface SectionLockController {
  /** OutlinePanel が都度参照するロック一覧。 */
  getUi: () => SectionLockUiEntry[];
  /** heading-only index のセクションをロック / 解除する（人間の明示操作）。 */
  toggle: (headingIndex: number) => void;
  /** frontmatter 変更などの外部要因で再計算する。 */
  refresh: () => void;
  dispose: () => void;
}

export function installSectionLocks(options: SectionLockOptions): SectionLockController {
  const { editor, getFrontmatter, setFrontmatter, markDirty, saveContent } = options;

  ensureSectionLockStyles(document);
  let sectionLockUi: SectionLockUiEntry[] = [];

  const currentFullMarkdown = (): string | null => {
    const body = getMarkdownFromEditorSafe(editor);
    if (body == null) return null;
    return prependFrontmatter(body, getFrontmatter());
  };

  const computeUi = (): SectionLockUiEntry[] => {
    const frontmatter = getFrontmatter();
    if (frontmatter === null || !frontmatter.includes("lockedSections")) return [];
    const full = currentFullMarkdown();
    if (full == null) return sectionLockUi;
    return computeSectionLockState(full).ui;
  };

  const refresh = (): void => {
    const next = computeUi();
    if (next.length === 0 && sectionLockUi.length === 0) return;
    sectionLockUi = next;
    // 装飾の再計算を促す（doc 不変のため meta で通知）
    editor.view.dispatch(editor.state.tr.setMeta(SECTION_LOCK_REFRESH_META, true));
  };

  // 初期状態は dispatch せずに反映する。installChrome 実行中の dispatch は
  // 'transaction' 購読（コメント dirty 追跡等）を初期化前の chrome（statusBar 等・TDZ）へ
  // カスケードさせ、ロック付き文書を開いた瞬間に ReferenceError で mount が壊れる。
  // registerPlugin の state.init が現在の sectionLockUi から装飾を構築するため
  // 初期表示に dispatch は不要（S4 受入で顕在化した web-app の実障害）。
  sectionLockUi = computeUi();
  editor.registerPlugin(createSectionLockPlugin(() => sectionLockUi));

  // 見出しの増減・並び替えで headingIndex 対応が変わったときだけ再計算する
  // （ロック節自体は Plugin が編集をブロックするため、通常の本文編集では不変）。
  const computeHeadingSignature = (): string => {
    const parts: string[] = [];
    // markdown-core の dist 未ビルド時に doc が any へ落ちるため、必要な形だけを明示する
    // （実型は ProseMirror の Node。パラメータ位置は双変なので構造的上位型で受けられる）。
    type HeadingLike = { type: { name: string }; attrs: Record<string, unknown>; textContent: string };
    editor.state.doc.forEach((node: HeadingLike) => {
      if (node.type.name === "heading") {
        parts.push(`${node.attrs.level as number}:${node.textContent}`);
      }
    });
    return parts.join("\n");
  };
  let headingSignature = computeHeadingSignature();

  const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
    if (!transaction.docChanged || sectionLockUi.length === 0) return;
    const next = computeHeadingSignature();
    if (next !== headingSignature) {
      headingSignature = next;
      refresh();
    }
  };
  editor.on("transaction", onTransaction);

  const toggle = (headingIndex: number): void => {
    const full = currentFullMarkdown();
    if (full == null) return;
    const sections = listSections(full);
    const target = sections[headingIndex];
    if (!target) return;
    const existing = computeSectionLockState(full).ui.find((l) => l.headingIndex === headingIndex);
    const nextFull = existing
      ? removeLockedSection(full, existing.path, existing.occurrence)
      : upsertLockedSection(full, {
          path: target.path,
          occurrence: target.occurrence,
          hash: computeSectionHash(full, target),
          lockedAt: new Date().toISOString(),
          lockedBy: "human",
        });
    // ロック操作はユーザーの編集意図を伴わない frontmatter 更新のため、
    // null → 値 遷移（lockedSections の新規作成）でもブロックを自動展開しない。
    setFrontmatter(parseFrontmatter(nextFull).frontmatter, { autoExpand: false });
    markDirty();
    saveContent(() => getMarkdownFromEditorSafe(editor));
    refresh();
  };

  return {
    getUi: () => sectionLockUi,
    toggle,
    refresh,
    dispose: () => editor.off("transaction", onTransaction),
  };
}
