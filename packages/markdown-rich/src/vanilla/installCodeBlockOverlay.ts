/**
 * 脱React の codeBlock overlay 統合 installer（React `CodeDialogHost` の vanilla 対応）。
 *
 * 選択追従・ツールバー・折畳み・autoEditOpen は既存の {@link createCodeBlockChrome}（vanilla）が
 * 担い、本 installer は intent（edit / export / exportSource / delete）を vanilla ダイアログ
 * （`vanilla/createXxxEditDialog`）と図エクスポート（`diagramCapture`）へ橋渡しする。
 *
 * React 版との差分:
 * - html プレビューは syntax highlight プレビュー（sanitize 済み HTML レンダは未対応）。
 * - embed 編集は URL のみ（variant 切替 UI は未対応・既存 variant を維持）。
 * - math のグラフ表示（GraphView）は未移植（createMathEditDialog 側 TODO）。
 *
 * 依存方向: vanilla → markdown-viewer（ui-vanilla / blockChrome utils）/ markdown-core。
 * React / markdown-react 非依存。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import {
  buildEmbedInfoString,
  createButton,
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogTitle,
  createTextField,
  deleteBlockAt,
  nextDialogTitleId,
  parseEmbedInfoString,
  setBlockAttrs,
} from "@anytime-markdown/markdown-viewer";

import {
  classifyCodeBlock,
  type CodeBlockKind,
} from "../components/codeblock/CodeBlockBlockContent";
import { createCodeBlockChrome } from "../components/codeblock/codeBlockChrome";
import {
  codeBlockToolbarLabel,
  firstNonEmptyLine,
} from "../components/codeblock/codeBlockOverlayHelpers";
import { parseBaseline } from "../components/codeblock/embedPreviewMount";
import { applyCodeBlockText } from "../components/codeblock/useCodeBlockEdit";
import htmlSamples from "../constants/htmlSamples.json";
import { getCachedMermaidSvg, requestMermaidRender } from "../hooks/useMermaidRender";
import { buildPlantUmlImageUrl } from "../hooks/usePlantUmlRender";
import { createCodeEditState } from "./codeEditState";
import { captureDiagramPng, exportDiagramSource } from "./diagramCapture";
import { createCodeBlockEditDialog } from "./createCodeBlockEditDialog";
import { createMathEditDialog } from "./createMathEditDialog";
import { createMermaidEditDialog } from "./createMermaidEditDialog";
import { createPlantUmlEditDialog } from "./createPlantUmlEditDialog";

/** ダイアログ外観（live 取得用）。 */
export interface CodeOverlayStyle {
  editorBg: string;
  fontSize: number;
  lineHeight: number;
}

/** {@link installCodeBlockOverlay} のオプション。 */
export interface InstallCodeBlockOverlayOptions {
  /** i18n。 */
  t: (key: string) => string;
  /** dark テーマか（ダイアログ open / export 時に評価）。既定 false。 */
  getIsDark?: () => boolean;
  /** graph 機能を隠すか（jsxgraph/plotly 未バンドル環境）。既定 false。 */
  getHideGraph?: () => boolean;
  /** ダイアログの外観設定（open 時に評価）。 */
  getStyle?: () => CodeOverlayStyle;
  /** 削除/破棄の確認。未指定時は vanilla 確認ダイアログ。 */
  confirm?: (message: string) => Promise<boolean>;
}

const DEFAULT_STYLE: CodeOverlayStyle = { editorBg: "white", fontSize: 16, lineHeight: 1.6 };

/** vanilla 確認ダイアログ（installBlockOverlays.confirmDelete と同パターン）。 */
function confirmVanilla(t: (key: string) => string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const titleId = nextDialogTitleId();
    let settled = false;
    const settle = (result: boolean, close: () => void): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
      close();
    };
    const dialog = createDialog({
      titleId,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
        dialog.destroy();
      },
    });
    const title = createDialogTitle({ id: titleId, text: t("delete") });
    const content = createDialogContent({ text: message });
    const cancelBtn = createButton({
      text: t("cancel"),
      onClick: () => settle(false, () => dialog.destroy()),
    });
    const okBtn = createButton({
      text: t("delete"),
      color: "error",
      variant: "contained",
      onClick: () => settle(true, () => dialog.destroy()),
    });
    const actions = createDialogActions({ children: [cancelBtn.el, okBtn.el] });
    dialog.panel.append(title.el, content.el, actions.el);
  });
}

/**
 * codeBlock overlay（chrome + 編集ダイアログ + 図エクスポート + 削除確認）を editor に装着する。
 *
 * @returns dispose（chrome / 開いているダイアログ / レンダ購読を解放する）。
 */
export function installCodeBlockOverlay(
  editor: Editor,
  opts: InstallCodeBlockOverlayOptions,
): () => void {
  const { t } = opts;
  const isDark = (): boolean => opts.getIsDark?.() ?? false;
  const style = (): CodeOverlayStyle => opts.getStyle?.() ?? DEFAULT_STYLE;
  const confirm = (message: string): Promise<boolean> =>
    opts.confirm ? opts.confirm(message) : confirmVanilla(t, message);

  let pos = -1;
  let node: PMNode | null = null;
  let activeDialog: { el: HTMLElement; destroy: () => void } | null = null;
  let cancelRender: (() => void) | null = null;
  let unsubscribeState: (() => void) | null = null;
  let discardPromptShown = false;

  const closeDialog = (): void => {
    cancelRender?.();
    cancelRender = null;
    unsubscribeState?.();
    unsubscribeState = null;
    activeDialog?.destroy();
    activeDialog = null;
  };

  const editState = createCodeEditState({
    editor,
    pos,
    node,
    onClose: (open) => {
      if (!open) closeDialog();
    },
  });

  // 破棄確認（React DiscardDialog 相当）: discardOpen が立ったら confirm で代替する。
  const watchDiscard = (): void => {
    if (!editState.isDiscardOpen() || discardPromptShown) return;
    discardPromptShown = true;
    confirm(t("spreadsheetDiscardMessage"))
      .then((ok) => {
        if (ok) {
          editState.handleDiscardConfirm();
        } else {
          editState.setDiscardOpen(false);
        }
      })
      .catch((error) => {
        console.warn("[installCodeBlockOverlay] discard confirm rejected", error);
        editState.setDiscardOpen(false);
      })
      .finally(() => {
        discardPromptShown = false;
      });
  };

  const languageOf = (): string => (node?.attrs.language as string) ?? "";
  const isMermaidNow = (): boolean => languageOf() === "mermaid";
  const isPlantUmlNow = (): boolean => languageOf() === "plantuml";

  /** mermaid の svg を一度だけ解決して cb へ渡す（キャッシュ優先・なければ単発レンダ）。 */
  const withMermaidSvg = (code: string, cb: (svg: string) => void): void => {
    const cached = getCachedMermaidSvg(code, isDark());
    if (cached) {
      cb(cached);
      return;
    }
    cancelRender?.();
    cancelRender = requestMermaidRender(code, isDark(), (svg, error) => {
      if (error) console.warn("[installCodeBlockOverlay] mermaid render failed", error);
      if (svg) cb(svg);
    });
  };

  const doExport = (): void => {
    const code = node?.textContent ?? "";
    if (isMermaidNow()) {
      withMermaidSvg(code, (svg) => {
        void captureDiagramPng({
          isMermaid: true,
          isPlantUml: false,
          svg,
          plantUmlUrl: undefined,
          code,
          isDark: isDark(),
        });
      });
    } else if (isPlantUmlNow()) {
      void captureDiagramPng({
        isMermaid: false,
        isPlantUml: true,
        svg: undefined,
        plantUmlUrl: buildPlantUmlImageUrl(code, isDark()),
        code,
        isDark: isDark(),
      });
    }
  };

  const doExportSource = (): void => {
    void exportDiagramSource(node?.textContent ?? "", isMermaidNow());
  };

  /** embed の URL 編集（React EmbedEditDialog の最小 vanilla 代替・variant は維持）。 */
  const openEmbedEdit = (): void => {
    const language = languageOf();
    const titleId = nextDialogTitleId();
    const dialog = createDialog({ titleId, onClose: () => closeDialog() });
    const title = createDialogTitle({ id: titleId, text: t("embed") });
    const field = createTextField({
      label: "URL",
      value: firstNonEmptyLine(node?.textContent ?? ""),
      fullWidth: true,
    });
    const content = createDialogContent({ children: [field.el] });
    const cancelBtn = createButton({ text: t("cancel"), onClick: () => closeDialog() });
    const applyBtn = createButton({
      text: t("apply"),
      variant: "contained",
      onClick: () => {
        const url = field.getValue().trim();
        if (url && pos >= 0 && node) {
          const variant = parseEmbedInfoString(language)?.variant ?? "card";
          const width = parseEmbedInfoString(language)?.width ?? null;
          setBlockAttrs(editor, pos, {
            language: buildEmbedInfoString(variant, width, parseBaseline(language)),
          });
          applyCodeBlockText(editor, pos, node.content.size, url);
        }
        closeDialog();
      },
    });
    const actions = createDialogActions({ children: [cancelBtn.el, applyBtn.el] });
    dialog.panel.append(title.el, content.el, actions.el);
    activeDialog = { el: dialog.panel, destroy: () => dialog.destroy() };
  };

  const openEdit = (): void => {
    if (!node || pos < 0) return;
    closeDialog();
    const language = languageOf();
    const kind: CodeBlockKind = classifyCodeBlock(language);
    editState.update({ editor, pos, node });
    editState.onOpen();
    unsubscribeState = editState.subscribe(watchDiscard);
    const { editorBg, fontSize, lineHeight } = style();
    const common = {
      isDark: isDark(),
      editorBg,
      fontSize,
      lineHeight,
      readOnly: !editor.isEditable,
      state: editState,
      t,
      onClose: () => editState.tryCloseEdit(),
    };

    if (kind === "embed") {
      openEmbedEdit();
      return;
    }
    if (kind === "math") {
      const handle = createMathEditDialog({
        ...common,
        label: "Math",
        hideGraph: opts.getHideGraph?.() ?? false,
      });
      activeDialog = handle;
      return;
    }
    if (kind === "diagram" && language === "mermaid") {
      const code = editState.getCode();
      const handle = createMermaidEditDialog({
        ...common,
        label: t("mermaid"),
        code,
        svg: getCachedMermaidSvg(code, isDark()) || undefined,
        onExport: doExport,
        onExportSource: doExportSource,
        exportSourceKey: "exportMmd",
      });
      activeDialog = handle;
      // 入力に追従して svg を再レンダ（requestMermaidRender 自体が 500ms debounce を持つ）。
      const renderNow = (): void => {
        cancelRender?.();
        cancelRender = requestMermaidRender(editState.getFsCode(), isDark(), (svg, error) => {
          if (error) console.warn("[installCodeBlockOverlay] mermaid render failed", error);
          if (svg) handle.updateSvg(svg);
        });
      };
      const baseUnsub = unsubscribeState;
      const renderUnsub = editState.subscribe(renderNow);
      unsubscribeState = () => {
        baseUnsub?.();
        renderUnsub();
      };
      renderNow();
      return;
    }
    if (kind === "diagram" && language === "plantuml") {
      const code = editState.getCode();
      const handle = createPlantUmlEditDialog({
        ...common,
        label: t("plantuml"),
        code,
        plantUmlUrl: buildPlantUmlImageUrl(code, isDark()),
        onExport: doExport,
        onExportSource: doExportSource,
        exportSourceKey: "exportPuml",
      });
      activeDialog = handle;
      const baseUnsub = unsubscribeState;
      const renderUnsub = editState.subscribe(() => {
        handle.updateUrl(buildPlantUmlImageUrl(editState.getFsCode(), isDark()));
      });
      unsubscribeState = () => {
        baseUnsub?.();
        renderUnsub();
      };
      return;
    }
    // regular / html / その他 unknown kind はコード編集ダイアログ。
    const isHtml = kind === "html";
    const handle = createCodeBlockEditDialog({
      ...common,
      label: isHtml ? t("htmlPreview") : codeBlockToolbarLabel(kind, language, t),
      language: isHtml ? "html" : language || "plaintext",
      renderPreview: true,
      customSamples: isHtml
        ? (htmlSamples as Array<{ enabled: boolean } & Record<string, unknown>>)
            .filter((s) => s.enabled)
            .map((s) => s as never)
        : undefined,
    });
    activeDialog = handle;
  };

  const destroyChrome = createCodeBlockChrome(editor, {
    t,
    isGraphHidden: () => opts.getHideGraph?.() ?? false,
    onSelect: (p, n) => {
      pos = p;
      node = n;
      editState.update({ pos, node });
    },
    onEdit: () => openEdit(),
    onExport: () => doExport(),
    onExportSource: () => doExportSource(),
    onDelete: () => {
      void confirm(t("clearConfirm")).then((ok) => {
        if (ok) deleteBlockAt(editor, pos);
      });
    },
  });

  return () => {
    closeDialog();
    destroyChrome();
  };
}
