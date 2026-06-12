/**
 * 脱React の vanilla DOM「CommentPanel」ファクトリ
 * （framework-decoupling Phase 3・追加のみ・本番未配線）。
 *
 * React 原版 `components/CommentPanel.tsx`（Paper + ToggleButtonGroup + ButtonBase カード +
 * インライン編集 TextField + 画像アノテーション一覧）を素 DOM へ移植したもの。コメント一覧/
 * スレッドパネルで、フィルタ（all/open/resolved）切替・コメントのインライン編集・resolve/
 * unresolve・delete、および画像アノテーションコメントの一覧/resolve/delete を扱う。
 *
 * React 版は `open` boolean で表示制御し `Paper` を返していたが、vanilla 版はパネル系の規約に
 * 従い `el`（Paper ルート）を返し、呼び元が配置する（self-append しない）。表示/非表示は
 * 呼び元が el の mount/unmount で制御する。
 *
 * 変換規約:
 * - React props → opts。`editor` / `t` を opts で受ける。CRUD は editor.commands を直接叩く
 *   React 版と同等だが、テスト容易性のため opts のコールバック（onResolve / onUnresolve /
 *   onDelete / onUpdateText / onNavigate / onSave）でも差し替え可能にする。未指定時は
 *   editor.commands を直接呼ぶ既定実装にフォールバックする。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。
 *   `getDivider` / `getTextSecondary` / `getTextDisabled` は対応する `--am-color-*` を直接参照する。
 * - `useEditorState`（コメント Map / 画像アノテーション）→ `editor.on("update")` 購読 + 手続き的
 *   再描画（destroy で off）。
 * - useState（filter / editingId / editText）/ useRef（isCommittingRef）→ closure 変数。
 *   Ctrl+Enter → commitEdit と onBlur → commitEdit の二重実行抑止フラグも closure（React 版
 *   isCommittingRef と同一ロジック）。
 * - スクロール（scrollIntoView）は jsdom 未実装のため optional 呼び出し（?.()）でガードする。
 */

import {
  createButton,
  createDivider,
  createIconButton,
  createPaper,
  createTextField,
  createToggleButton,
  createToggleButtonGroup,
  svgIcon,
  type TextFieldHandle,
} from "../ui-vanilla";
import {
  BADGE_NUMBER_FONT_SIZE,
  COMMENT_BODY_FONT_SIZE,
  COMMENT_INPUT_FONT_SIZE,
  COMMENT_PANEL_WIDTH,
  PANEL_HEADER_MIN_HEIGHT,
  SMALL_BUTTON_FONT_SIZE,
  SMALL_CAPTION_FONT_SIZE,
} from "../constants/dimensions";
import { commentDataPluginKey } from "../extensions/commentExtension";
import type { Editor } from "@anytime-markdown/markdown-core";
import type { TranslationFn } from "../types";
import type { ImageAnnotation } from "../types/imageAnnotation";
import { parseAnnotations, serializeAnnotations } from "../types/imageAnnotation";
import type { InlineComment } from "../utils/commentHelpers";

// ui/icons.tsx と同一の Material SVG path（Close / Image）。
const ICON_CLOSE =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const ICON_IMAGE =
  "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z";

// React 版 .module.css の擬似クラス（hover / focus-visible）を素 DOM で再現するための注入用 CSS。
const STYLE_ELEMENT_ID = "am-vanilla-comment-panel-style";

// 画像アノテーションの 1 件（収集結果）。
interface AnnotatedImage {
  pos: number;
  src: string;
  allAnnotations: ImageAnnotation[];
  annotations: ImageAnnotation[];
}

type CommentFilter = "all" | "open" | "resolved";

/** {@link createCommentPanel} のオプション（React `CommentPanelProps` の vanilla 置換）。 */
export interface CreateCommentPanelOptions {
  /** TipTap エディタ。コメント Map / 画像アノテーションの購読元かつ CRUD の既定実行先。 */
  editor: Editor;
  /** i18n。 */
  t: TranslationFn;
  /** コメント保存トリガ（React `onSave`）。CRUD 後に呼ぶ。 */
  onSave?: () => void;
  /** comment を resolve する。未指定時は editor.commands.resolveComment。 */
  onResolve?: (commentId: string) => void;
  /** comment を unresolve（reopen）する。未指定時は editor.commands.unresolveComment。 */
  onUnresolve?: (commentId: string) => void;
  /** comment を削除する。未指定時は editor.commands.removeComment。 */
  onDelete?: (commentId: string) => void;
  /** comment テキストを更新する。未指定時は editor.commands.updateCommentText。 */
  onUpdateText?: (commentId: string, text: string) => void;
  /** comment / 画像へジャンプする。未指定時は editor のカーソル移動 + scrollIntoView。 */
  onNavigate?: (pos: number) => void;
  /** 閉じる要求（ヘッダーの close ボタン）。React `onClose` 相当。 */
  onClose?: () => void;
}

/** {@link createCommentPanel} の戻り値（パネル系。呼び元が el を配置する）。 */
export interface CommentPanelHandle {
  /** Paper ルート（呼び元が配置する）。 */
  el: HTMLElement;
  /** editor 購読を解除し、子コントロールの listener を解放する。 */
  destroy: () => void;
}

/** hover / focus-visible の擬似クラスを `<head>` へ 1 度だけ注入する。React .module.css と対応。 */
function ensureStyleInjected(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = [
    "[data-am-comment-card]{display:block;text-align:left;width:100%;box-sizing:border-box;" +
      "margin-bottom:8px;padding:8px;border:1px solid var(--am-color-divider);border-radius:4px;cursor:pointer;}",
    "[data-am-comment-card]:hover,[data-am-comment-card]:focus-visible{background-color:var(--am-color-action-hover);}",
    "[data-am-comment-card]:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:-2px;}",
    "[data-am-comment-body]:hover{background-color:var(--am-color-action-hover);border-radius:2px;}",
    "[data-am-annotation-card]{display:block;text-align:left;width:100%;box-sizing:border-box;cursor:pointer;}",
  ].join("\n");
  document.head.appendChild(style);
}

/**
 * ドキュメント内でコメント ID に対応するテキストまたは位置を取得する（React 版 findCommentInDoc と同一）。
 */
function findCommentInDoc(
  editor: Editor,
  commentId: string,
): { text: string; pos: number; isPoint: boolean } | null {
  let result: { text: string; pos: number; isPoint: boolean } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type.name === "commentPoint" && node.attrs.commentId === commentId) {
      result = { text: "", pos, isPoint: true };
      return false;
    }
    if (node.isText) {
      const mark = node.marks.find(
        (m) => m.type.name === "commentHighlight" && m.attrs.commentId === commentId,
      );
      if (mark) {
        result = { text: node.text || "", pos, isPoint: false };
        return false;
      }
    }
    return undefined;
  });
  return result;
}

/** Plugin State から現在のコメント一覧を取得する（React 版 useEditorState selector と同一）。 */
function readComments(editor: Editor): InlineComment[] {
  const state = commentDataPluginKey.getState(editor.state) as
    | { comments: Map<string, InlineComment> }
    | undefined;
  return Array.from((state?.comments ?? new Map<string, InlineComment>()).values());
}

/** ドキュメントからコメント付き画像アノテーションを収集する（React 版 useEditorState selector と同一）。 */
function readImageAnnotations(editor: Editor): AnnotatedImage[] {
  const result: AnnotatedImage[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.annotations) {
      const allAnnotations = parseAnnotations(node.attrs.annotations as string);
      const withComments = allAnnotations.filter((a) => a.comment);
      if (withComments.length > 0) {
        result.push({ pos, src: node.attrs.src as string, allAnnotations, annotations: withComments });
      }
    }
    return undefined;
  });
  return result;
}

/**
 * vanilla CommentPanel を生成する。`el`（Paper ルート）を呼び元が配置する。editor の update を
 * 購読してコメント一覧/画像アノテーションを手続き的に再描画する。`destroy()` で購読解除する。
 */
export function createCommentPanel(opts: CreateCommentPanelOptions): CommentPanelHandle {
  ensureStyleInjected();
  const { editor, t } = opts;

  // CRUD の既定実装（opts 未指定時は editor.commands を直接叩く）。
  const onSave = (): void => opts.onSave?.();
  const doResolve = (id: string): void => {
    if (opts.onResolve) opts.onResolve(id);
    else editor.commands.resolveComment(id);
  };
  const doUnresolve = (id: string): void => {
    if (opts.onUnresolve) opts.onUnresolve(id);
    else editor.commands.unresolveComment(id);
  };
  const doDelete = (id: string): void => {
    if (opts.onDelete) opts.onDelete(id);
    else editor.commands.removeComment(id);
  };
  const doUpdateText = (id: string, text: string): void => {
    if (opts.onUpdateText) opts.onUpdateText(id, text);
    else editor.commands.updateCommentText(id, text);
  };

  // --- closure 状態（React useState/useRef の置換） ---
  let filter: CommentFilter = "all";
  let editingId: string | null = null;
  let editText = "";
  // Ctrl+Enter → commitEdit と直後の onBlur → commitEdit の二重実行抑止（React isCommittingRef 相当）。
  let isCommitting = false;
  // 現在の編集 TextField ハンドル（再描画/破棄で解放するため保持）。
  let editField: TextFieldHandle | null = null;

  // 再描画ごとに作り直す子コントロールのハンドル集合（前回ぶんを destroy するため保持）。
  let bodyHandles: Array<{ destroy: () => void }> = [];

  /** comment / 画像へジャンプ（カーソル移動 + scrollIntoView）。jsdom 未実装ガード付き。 */
  const navigate = (pos: number): void => {
    if (opts.onNavigate) {
      opts.onNavigate(pos);
      return;
    }
    editor.chain().setTextSelection(pos).focus().run();
    const domAtPos = editor.view.domAtPos(pos);
    const el =
      domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
    // scrollIntoView は jsdom 未実装のため optional 呼び出しでガードする。
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  };

  /** 編集セッションを開始する（React startEdit と同一ロジック）。 */
  const startEdit = (comment: InlineComment): void => {
    isCommitting = false;
    editingId = comment.id;
    editText = comment.text;
    render();
    // mount 後に focus（React の setTimeout 50ms と同様、遅延 focus）。
    setTimeout(() => editField?.input.focus(), 50);
  };

  /** 編集を確定する（二重コミット抑止込み・React commitEdit と同一）。 */
  const commitEdit = (): void => {
    if (!editingId || isCommitting) return;
    isCommitting = true;
    doUpdateText(editingId, editText);
    onSave();
    editingId = null;
    render();
  };

  /** 編集をキャンセルする。 */
  const cancelEdit = (): void => {
    editingId = null;
    render();
  };

  /** 画像アノテーションの resolved を切替（React toggleAnnotationResolved と同一）。 */
  const toggleAnnotationResolved = (imgPos: number, annotationId: string): void => {
    const node = editor.state.doc.nodeAt(imgPos);
    if (node?.type.name !== "image") return;
    const all = parseAnnotations(node.attrs.annotations as string);
    const updated = all.map((a) =>
      a.id === annotationId ? { ...a, resolved: !a.resolved } : a,
    );
    const { tr } = editor.state;
    tr.setNodeMarkup(imgPos, undefined, {
      ...node.attrs,
      annotations: serializeAnnotations(updated),
    });
    editor.view.dispatch(tr);
    onSave();
  };

  /** 画像アノテーションを削除（React deleteAnnotation と同一）。 */
  const deleteAnnotation = (imgPos: number, annotationId: string): void => {
    const node = editor.state.doc.nodeAt(imgPos);
    if (node?.type.name !== "image") return;
    const all = parseAnnotations(node.attrs.annotations as string);
    const updated = all.filter((a) => a.id !== annotationId);
    const { tr } = editor.state;
    tr.setNodeMarkup(imgPos, undefined, {
      ...node.attrs,
      annotations: serializeAnnotations(updated),
    });
    editor.view.dispatch(tr);
    onSave();
  };

  // --- Paper ルート（outlined・縦 flex・幅固定） ---
  const root = createPaper({
    variant: "outlined",
    style: {
      width: `${COMMENT_PANEL_WIDTH}px`,
      minWidth: `${COMMENT_PANEL_WIDTH}px`,
      flex: "1",
      borderLeft: "1px solid var(--am-color-divider)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      backgroundColor: "var(--am-color-bg-default)",
    },
  }).el;

  // --- ヘッダー（タイトル + close） ---
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;padding-left:8px;padding-right:8px;" +
    `min-height:${PANEL_HEADER_MIN_HEIGHT}px;border-bottom:1px solid var(--am-color-divider);`;
  const headerTitle = document.createElement("h6");
  headerTitle.style.cssText =
    "margin:0;flex:1;font-weight:700;font-size:0.875rem;line-height:1.57;letter-spacing:0.00714em;";
  headerTitle.setAttribute("aria-live", "polite");
  headerTitle.setAttribute("aria-atomic", "true");
  const closeBtn = createIconButton({
    size: "small",
    ariaLabel: t("close") || "Close",
    children: svgIcon(ICON_CLOSE, 18),
    onClick: () => opts.onClose?.(),
  });
  header.append(headerTitle, closeBtn.el);
  root.appendChild(header);

  // --- フィルタ（ToggleButtonGroup） ---
  const filterWrap = document.createElement("div");
  filterWrap.style.cssText = "padding:4px 8px;";
  const filterGroup = createToggleButtonGroup({
    value: filter,
    size: "small",
    ariaLabel: t("commentPanel"),
    onChange: (v) => {
      if (typeof v === "string") {
        filter = v as CommentFilter;
        filterGroup.setValue(filter);
        render();
      }
    },
  });
  filterGroup.el.style.width = "100%";
  const filterItems: Array<{ value: CommentFilter; label: string }> = [
    { value: "all", label: t("commentFilterAll") || "All" },
    { value: "open", label: t("commentFilterOpen") || "Open" },
    { value: "resolved", label: t("commentFilterResolved") || "Resolved" },
  ];
  for (const item of filterItems) {
    const btn = createToggleButton({ value: item.value, children: item.label });
    // .filterButton 相当（compact padding + flex:1）。
    btn.el.style.flex = "1";
    btn.el.style.paddingTop = "2px";
    btn.el.style.paddingBottom = "2px";
    btn.el.style.fontSize = "12px";
    filterGroup.register(btn);
  }
  filterWrap.appendChild(filterGroup.el);
  root.appendChild(filterWrap);

  // --- コメント一覧コンテナ（スクロール領域） ---
  const listBody = document.createElement("div");
  listBody.style.cssText = "flex:1;overflow:auto;padding:8px;";
  root.appendChild(listBody);

  // ---- 子要素ビルダー ----

  /** caption Text（block・secondary 色）を作る。 */
  const captionEl = (text: string, extraCss = ""): HTMLElement => {
    const span = document.createElement("span");
    span.style.cssText =
      "display:block;margin:0;font-size:0.75rem;line-height:1.66;letter-spacing:0.03333em;" +
      `color:var(--am-color-text-secondary);${extraCss}`;
    span.textContent = text;
    return span;
  };

  /** resolve / delete アクションボタン行を作る。 */
  const actionRow = (
    resolved: boolean,
    onToggle: () => void,
    onRemove: () => void,
  ): HTMLElement => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;";
    const toggleBtn = createButton({
      size: "small",
      variant: "text",
      label: resolved ? t("commentUnresolve") || "Reopen" : t("commentResolve") || "Resolve",
      onClick: () => {
        onToggle();
      },
    });
    toggleBtn.el.style.minWidth = "0";
    toggleBtn.el.style.paddingLeft = "4px";
    toggleBtn.el.style.paddingRight = "4px";
    toggleBtn.el.style.fontSize = SMALL_BUTTON_FONT_SIZE;
    const deleteBtn = createButton({
      size: "small",
      variant: "text",
      color: "error",
      label: t("commentDelete") || "Delete",
      onClick: () => {
        onRemove();
      },
    });
    deleteBtn.el.style.minWidth = "0";
    deleteBtn.el.style.paddingLeft = "4px";
    deleteBtn.el.style.paddingRight = "4px";
    deleteBtn.el.style.fontSize = SMALL_BUTTON_FONT_SIZE;
    bodyHandles.push(toggleBtn, deleteBtn);
    row.append(toggleBtn.el, deleteBtn.el);
    return row;
  };

  /** コメントカード 1 件を作る。 */
  const commentCard = (comment: InlineComment): HTMLElement => {
    const found = findCommentInDoc(editor, comment.id);
    const card = document.createElement("div");
    card.setAttribute("data-am-comment-card", "");
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.style.opacity = comment.resolved ? "0.5" : "1";
    // カードクリックでジャンプ（編集 TextField / アクションボタンは stopPropagation で除外）。
    const onCardClick = (): void => {
      if (found) navigate(found.pos + 1);
    };
    card.addEventListener("click", onCardClick);
    bodyHandles.push({ destroy: () => card.removeEventListener("click", onCardClick) });

    // 対象テキスト / point ラベル。
    if (found && !found.isPoint && found.text) {
      const quote = captionEl(
        `“${found.text}”`,
        "margin-bottom:4px;font-style:italic;border-left:2px solid var(--am-color-divider);" +
          "padding-left:8px;max-height:2.8em;overflow:hidden;",
      );
      card.appendChild(quote);
    } else if (found?.isPoint) {
      card.appendChild(captionEl(t("commentPointLabel") || "Point comment", "margin-bottom:4px;"));
    }

    // コメント本文 or 編集 TextField。
    if (editingId === comment.id) {
      const field = createTextField({
        value: editText,
        multiline: true,
        size: "small",
        fullWidth: true,
        style: { marginBottom: "4px" },
        onChange: (e) => {
          editText = (e.target as HTMLTextAreaElement).value;
        },
        onKeyDown: (e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commitEdit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        },
        onClick: (e) => e.stopPropagation(),
        onBlur: commitEdit,
      });
      // React 版の TextField CSS 変数（input font-size / padding）を再現。
      field.el.style.setProperty("--tf-input-font-size", COMMENT_INPUT_FONT_SIZE);
      field.el.style.setProperty("--tf-input-pad-y", "6px");
      field.el.style.setProperty("--tf-input-pad-x", "6px");
      editField = field;
      bodyHandles.push(field);
      card.appendChild(field.el);
    } else {
      const body = document.createElement("p");
      body.setAttribute("data-am-comment-body", "");
      body.style.cssText =
        "margin:0;margin-bottom:4px;font-size:0.875rem;line-height:1.43;letter-spacing:0.01071em;" +
        "cursor:text;min-height:1.4em;";
      if (comment.text) {
        body.textContent = comment.text;
      } else {
        const placeholder = document.createElement("span");
        // text-disabled は --am-color-* に存在しないため secondary を薄めて代替する。
        placeholder.style.cssText = "color:var(--am-color-text-secondary);opacity:0.6;font-style:italic;";
        placeholder.textContent = t("commentPlaceholder") || "Add comment...";
        body.appendChild(placeholder);
      }
      const onBodyClick = (e: MouseEvent): void => {
        e.stopPropagation();
        startEdit(comment);
      };
      body.addEventListener("click", onBodyClick);
      bodyHandles.push({ destroy: () => body.removeEventListener("click", onBodyClick) });
      card.appendChild(body);
    }

    // アクション（resolve/unresolve・delete）。クリックは card のジャンプを止める。
    const actions = actionRow(
      comment.resolved,
      () => {
        if (comment.resolved) doUnresolve(comment.id);
        else doResolve(comment.id);
        onSave();
      },
      () => doDelete(comment.id),
    );
    // ボタンの click は card へバブリングしジャンプを誘発するため stopPropagation を挟む。
    const stopper = (e: MouseEvent): void => e.stopPropagation();
    actions.addEventListener("click", stopper);
    bodyHandles.push({ destroy: () => actions.removeEventListener("click", stopper) });
    card.appendChild(actions);

    return card;
  };

  /** 画像アノテーションカード 1 件を作る。 */
  const annotationCard = (img: AnnotatedImage, a: ImageAnnotation, index: number): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "margin-bottom:4px;padding:6px;border:1px solid var(--am-color-divider);border-radius:4px;" +
      `opacity:${a.resolved ? "0.5" : "1"};`;

    const cardBtn = document.createElement("div");
    cardBtn.setAttribute("data-am-annotation-card", "");
    cardBtn.setAttribute("role", "button");
    cardBtn.tabIndex = 0;
    const onCardClick = (): void => navigate(img.pos);
    cardBtn.addEventListener("click", onCardClick);
    bodyHandles.push({ destroy: () => cardBtn.removeEventListener("click", onCardClick) });

    const labelRow = document.createElement("div");
    labelRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:2px;";
    const badge = document.createElement("div");
    badge.style.cssText =
      "width:16px;height:16px;border-radius:50%;display:flex;align-items:center;" +
      `justify-content:center;flex-shrink:0;background-color:${a.color};`;
    const badgeNum = document.createElement("span");
    badgeNum.style.cssText = `color:white;font-size:${BADGE_NUMBER_FONT_SIZE};font-weight:700;line-height:1;`;
    badgeNum.textContent = String(index + 1);
    badge.appendChild(badgeNum);
    let annotationLabel: string;
    if (a.type === "rect") annotationLabel = t("annotationRect");
    else if (a.type === "circle") annotationLabel = t("annotationCircle");
    else annotationLabel = t("annotationLine");
    const labelText = document.createElement("span");
    labelText.style.cssText = `color:var(--am-color-text-secondary);font-size:${SMALL_CAPTION_FONT_SIZE};`;
    labelText.textContent = annotationLabel;
    labelRow.append(badge, labelText);
    cardBtn.appendChild(labelRow);

    const commentBody = document.createElement("p");
    commentBody.style.cssText = `margin:0;margin-bottom:4px;font-size:${COMMENT_BODY_FONT_SIZE};`;
    commentBody.textContent = a.comment ?? "";
    cardBtn.appendChild(commentBody);
    wrap.appendChild(cardBtn);

    const actions = actionRow(
      !!a.resolved,
      () => toggleAnnotationResolved(img.pos, a.id),
      () => deleteAnnotation(img.pos, a.id),
    );
    wrap.appendChild(actions);
    return wrap;
  };

  // ---- 再描画 ----

  /** listBody を現在の filter / editingId / コメント Map / 画像アノテーションから作り直す。 */
  function render(): void {
    // 前回ぶんの子ハンドルを解放してからクリア。
    for (const h of bodyHandles) h.destroy();
    bodyHandles = [];
    editField = null;
    listBody.replaceChildren();

    const allComments = readComments(editor);
    const imageAnnotations = readImageAnnotations(editor);

    const unresolvedCount = allComments.filter((c) => !c.resolved).length;
    const totalImageAnnotations = imageAnnotations.reduce((sum, img) => sum + img.annotations.length, 0);
    const unresolvedImageAnnotations = imageAnnotations.reduce(
      (sum, img) => sum + img.annotations.filter((a) => !a.resolved).length,
      0,
    );

    // ヘッダーカウント更新。
    headerTitle.textContent =
      `${t("commentPanel") || "Comments"} (${unresolvedCount + unresolvedImageAnnotations}/` +
      `${allComments.length + totalImageAnnotations})`;

    const filtered = allComments.filter((c) => {
      if (filter === "open") return !c.resolved;
      if (filter === "resolved") return c.resolved;
      return true;
    });

    if (filtered.length === 0) {
      const filterMessageKey = filter === "open" ? "noOpenComments" : "noResolvedComments";
      const emptyMessage = filter === "all" ? t("noComments") : t(filterMessageKey);
      const empty = document.createElement("p");
      empty.style.cssText =
        "margin:0;margin-top:16px;text-align:center;font-size:0.875rem;line-height:1.43;" +
        "color:var(--am-color-text-secondary);";
      empty.textContent = emptyMessage;
      listBody.appendChild(empty);
    }

    for (const comment of filtered) {
      listBody.appendChild(commentCard(comment));
    }

    // 画像アノテーション一覧。
    if (imageAnnotations.length > 0) {
      const divider = createDivider({});
      divider.el.style.marginTop = "8px";
      divider.el.style.marginBottom = "8px";
      listBody.appendChild(divider.el);

      const sectionLabel = document.createElement("span");
      sectionLabel.style.cssText =
        "display:flex;align-items:center;gap:4px;margin:0;margin-bottom:4px;font-weight:700;" +
        "font-size:0.75rem;line-height:1.66;color:var(--am-color-text-secondary);";
      const imgIcon = svgIcon(ICON_IMAGE, 14);
      const sectionText = document.createElement("span");
      sectionText.textContent = `${t("annotate")} (${unresolvedImageAnnotations}/${totalImageAnnotations})`;
      sectionLabel.append(imgIcon, sectionText);
      listBody.appendChild(sectionLabel);

      for (const img of imageAnnotations) {
        const filteredAnnotations = img.annotations.filter((a) => {
          if (filter === "open") return !a.resolved;
          if (filter === "resolved") return !!a.resolved;
          return true;
        });
        if (filteredAnnotations.length === 0) continue;
        const group = document.createElement("div");
        filteredAnnotations.forEach((a, i) => {
          group.appendChild(annotationCard(img, a, i));
        });
        listBody.appendChild(group);
      }
    }
  }

  // 初回描画。
  render();

  // editor update を購読し再描画する（React useEditorState 相当）。
  const onEditorUpdate = (): void => {
    // 編集中は再描画すると編集 TextField が破棄されフォーカスを失うため、
    // editingId が無いとき（または編集対象が消えたとき）のみ再描画する。
    if (editingId) {
      const stillExists = readComments(editor).some((c) => c.id === editingId);
      if (stillExists) {
        // 編集中のコメントが残っている間はヘッダーカウントのみ更新（一覧は維持）。
        return;
      }
      editingId = null;
    }
    render();
  };
  editor.on("update", onEditorUpdate);

  let destroyed = false;
  return {
    el: root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editor.off("update", onEditorUpdate);
      for (const h of bodyHandles) h.destroy();
      bodyHandles = [];
      closeBtn.destroy();
      filterGroup.destroy();
    },
  };
}
