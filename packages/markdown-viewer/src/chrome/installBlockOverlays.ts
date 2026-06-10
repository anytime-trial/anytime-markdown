/**
 * 脱React の block overlay 統合 installer（G3 / G2残 DialogHost 3 の vanilla 配線・追加のみ）。
 *
 * React の `GifDialogHost` / `ImageDialogHost` / `TableDialogHost`（3 host）が担っていた
 * 「vanilla block chrome（選択追従ツールバー）＋ 重量ダイアログ（録画/再生/crop/注釈/削除）＋
 * VS Code 保存フロー」を、独立 React component として再実装せず **vanilla で 1 つの installer に
 * 集約**したもの（G3 計画 plan/20260610-g3-app-root-flip-spec.ja.md §6）。
 *
 * - block chrome（`createGifBlockChrome` / `createImageBlockChrome` / `createTableBlockChrome`）の
 *   intent を、vanilla ダイアログ（`components-vanilla/*`）へ橋渡しする。
 * - VS Code 連携（gif `saveClipboardImage`→`imageSaved` / image `overwriteImage`）は React host と
 *   同一フローを replicate する。`vscodeApi` 既定は `window.__vscode`（test 注入可・`null` で web 経路）。
 * - **table のグリッド編集（SpreadsheetGrid）は React 専用**で vanilla 版が存在しないため、列/行/整列/
 *   移動の inline ops（chrome 内で editor コマンド直発火・vanilla）のみ配線し、グリッド編集 intent は
 *   任意の `onTableEdit`（React consumer が SpreadsheetGrid を開く）に委譲する。未指定時は no-op。
 *
 * 依存方向: chrome → components-vanilla / ui-vanilla / markdown-core。React / markdown-react 非依存。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import type { TranslationFn } from "../types";
import { deleteBlockAt, setBlockAttrs } from "./blockChrome";
import { createGifBlockChrome } from "./gifBlockChrome";
import { createImageBlockChrome } from "./imageBlockChrome";
import { createTableBlockChrome } from "./tableBlockChrome";
import { createGifPlayerDialog } from "../components-vanilla/GifPlayerDialog";
import { createGifRecorderDialog } from "../components-vanilla/GifRecorderDialog";
import { createImageCropTool } from "../components-vanilla/ImageCropTool";
import { createImageAnnotationDialog } from "../components-vanilla/ImageAnnotationDialog";
import { createScreenCaptureDialog } from "../components-vanilla/ScreenCaptureDialog";
import { createEditorDialogs } from "../components-vanilla/EditorDialogs";
import {
  confirmWithDialog,
  createButton,
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogTitle,
  nextDialogTitleId,
} from "../ui-vanilla";
import type { GifSettings } from "../utils/gifEncoder";
import { parseAnnotations, serializeAnnotations } from "../types/imageAnnotation";

/** {@link installBlockOverlays} のオプション。 */
export interface InstallBlockOverlaysOptions {
  /** i18n。 */
  t: TranslationFn;
  /** 削除確認。未指定時は vanilla 確認ダイアログ（{@link confirmDelete}）。 */
  confirm?: (message: string) => Promise<boolean>;
  /**
   * VS Code postMessage ブリッジ。未指定（undefined）時は `window.__vscode`、`null` 明示で web 経路。
   * テストでは stub を注入できる。
   */
  vscodeApi?: VsCodeApi | null;
  /**
   * table のグリッド編集 intent。vanilla スプレッドシートが存在しないため、React consumer が
   * SpreadsheetGrid ダイアログを開く。開いている間はツールバーを抑制するため `setEditing` を渡す
   * （consumer はダイアログ close 時に `setEditing(false)` を呼ぶ）。未指定時はグリッド編集 no-op。
   */
  onTableEdit?: (args: { pos: number; setEditing: (editing: boolean) => void }) => void;
}

/** {@link installBlockOverlays} の戻り値。 */
export interface BlockOverlaysHandle {
  /** chrome / ダイアログ / リスナを全て破棄する。 */
  destroy(): void;
}

/** editor.storage.image の onEditImage（URL 編集委譲）型。 */
interface ImageStorage {
  onEditImage?: (d: { pos: number; src: string; alt: string }) => void;
}

/**
 * gifBlock の `gifSettings` 属性（JSON 文字列）を安全に parse する。手編集・破損・truncate で不正な
 * JSON が来ても throw せず undefined を返す（再生は settings 無しで継続可能）。
 */
function parseGifSettings(raw: string | null): GifSettings | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as GifSettings;
  } catch (error) {
    console.warn("[installBlockOverlays] gifSettings の parse に失敗", error);
    return undefined;
  }
}

/**
 * vanilla の削除確認ダイアログ（React `DeleteBlockDialog` 相当）。`true`=削除確定 / `false`=取消。
 * 実体は ui-vanilla の {@link confirmWithDialog} に集約。
 */
function confirmDelete(t: TranslationFn): Promise<boolean> {
  return confirmWithDialog({
    title: t("delete"),
    message: t("clearConfirm"),
    confirmLabel: t("delete"),
    cancelLabel: t("cancel"),
  });
}

/**
 * gif / image / table の block overlay（vanilla chrome + ダイアログ + VS Code フロー）を editor へ装着する。
 *
 * @param editor mount 済みの editor。
 * @returns `destroy()` で全 chrome / アクティブダイアログ / message リスナ / storage hook を破棄。
 */
export function installBlockOverlays(
  editor: Editor,
  opts: InstallBlockOverlaysOptions,
): BlockOverlaysHandle {
  const { t } = opts;
  const vscodeApi: VsCodeApi | null =
    opts.vscodeApi !== undefined
      ? opts.vscodeApi
      : typeof window !== "undefined"
        ? (window.__vscode ?? null)
        : null;

  // 同時に開く重量ダイアログは 1 つ。新規 open は既存を閉じてから（confirmDelete は別ライフサイクル）。
  let activeDialog: { destroy: () => void } | null = null;
  const closeDialog = (): void => {
    activeDialog?.destroy();
    activeDialog = null;
  };

  const askDelete = (pos: number): void => {
    const fn = opts.confirm ? opts.confirm(t("clearConfirm")) : confirmDelete(t);
    fn.then((ok) => {
      if (ok) deleteBlockAt(editor, pos);
    }).catch((error) => {
      // confirm の reject を握り潰さず出力（削除はキャンセル扱いで継続）。
      console.error("[installBlockOverlays] 削除確認でエラー", error);
    });
  };

  // === GIF: 録画 / 再生 / 削除 + VS Code saveClipboardImage→imageSaved =====================
  let pendingSave: { id: string; pos: number } | null = null;
  // 録画完了時の FileReader（destroy 時に in-flight を abort してリーク/宙吊りを防ぐ）。
  let activeReader: FileReader | null = null;

  const openGifPlayer = (src: string, settings: GifSettings | undefined): void => {
    closeDialog();
    activeDialog = createGifPlayerDialog({ src, settings, t, onClose: closeDialog });
  };

  const handleRecordComplete =
    (pos: number) => (blob: Blob, fileName: string, settings: GifSettings): void => {
      closeDialog();
      const requestId =
        globalThis.crypto?.randomUUID?.() ?? `gif-${fileName}-${globalThis.performance?.now?.() ?? 0}`;
      const reader = new FileReader();
      activeReader = reader;
      if (vscodeApi) {
        pendingSave = { id: requestId, pos };
        reader.onload = () => {
          activeReader = null;
          if (typeof reader.result !== "string") return;
          vscodeApi.postMessage({
            type: "saveClipboardImage",
            dataUrl: reader.result,
            fileName,
            requestId,
          });
        };
        reader.readAsDataURL(blob);
        setBlockAttrs(editor, pos, { gifSettings: JSON.stringify(settings) });
      } else {
        reader.onload = () => {
          activeReader = null;
          // FileReader.result は string | ArrayBuffer | null。dataURL 読み出しは string だが防御的にガード。
          if (typeof reader.result !== "string") return;
          setBlockAttrs(editor, pos, {
            src: reader.result,
            alt: fileName,
            gifSettings: JSON.stringify(settings),
          });
        };
        reader.readAsDataURL(blob);
      }
    };

  const openGifRecorder = (pos: number): void => {
    closeDialog();
    activeDialog = createGifRecorderDialog({
      t,
      onClose: closeDialog,
      onComplete: handleRecordComplete(pos),
    });
  };

  const destroyGif = createGifBlockChrome(editor, {
    t,
    onEdit: (pos, { src, settings }) => {
      if (src) {
        openGifPlayer(src, parseGifSettings(settings));
      } else {
        openGifRecorder(pos);
      }
    },
    onRecord: (pos) => openGifRecorder(pos),
    onDelete: (pos) => askDelete(pos),
  });

  // VS Code 保存結果（imageSaved）を requestId 一致で取り込む（録画フロー）。
  const onMessage = (event: MessageEvent): void => {
    if (
      event.origin &&
      !event.origin.startsWith("vscode-webview://") &&
      event.origin !== globalThis.location?.origin
    )
      return;
    const data = event.data;
    const pending = pendingSave;
    if (
      data?.type === "imageSaved" &&
      typeof data.requestId === "string" &&
      pending &&
      data.requestId === pending.id &&
      typeof data.path === "string" &&
      data.path
    ) {
      pendingSave = null;
      setBlockAttrs(editor, pending.pos, { src: data.path });
    }
  };
  const messageBound = vscodeApi != null && typeof globalThis.addEventListener === "function";
  if (messageBound) globalThis.addEventListener("message", onMessage);

  // === Image: crop / annotate / screen capture / URL 編集 / 削除 + VS Code overwriteImage ===
  // URL 編集（image chrome → editor.storage.image.onEditImage 直接委譲）用の編集モードダイアログ。
  let imageEditPos = -1;
  const imageEditDialogs = createEditorDialogs({
    t,
    imageEditMode: true,
    onCommentInsert: () => {},
    onLinkInsert: () => {},
    onImageInsert: (url, alt) => {
      if (imageEditPos >= 0) setBlockAttrs(editor, imageEditPos, { src: url, alt });
    },
  });
  const imageStorage = (editor.storage as { image?: ImageStorage }).image;
  const prevOnEditImage = imageStorage?.onEditImage;
  if (imageStorage) {
    imageStorage.onEditImage = ({ pos, src, alt }) => {
      imageEditPos = pos;
      imageEditDialogs.openImage(src, alt);
    };
  }

  const applyCrop = (pos: number, src: string, croppedDataUrl: string): void => {
    if (src.startsWith("data:") || !vscodeApi) {
      setBlockAttrs(editor, pos, { src: croppedDataUrl });
      return;
    }
    vscodeApi.postMessage({ type: "overwriteImage", path: src, dataUrl: croppedDataUrl });
    setBlockAttrs(editor, pos, { src: `${src.split("?")[0]}?t=${Date.now()}` });
  };

  const openScreenCapture = (pos: number): void => {
    closeDialog();
    activeDialog = createScreenCaptureDialog({
      t,
      onCapture: (dataUrl) => {
        setBlockAttrs(editor, pos, { src: dataUrl });
        closeDialog();
      },
      onClose: closeDialog,
    });
  };

  const openImageCrop = (pos: number, src: string): void => {
    closeDialog();
    const titleId = nextDialogTitleId();
    const crop = createImageCropTool({
      src,
      t,
      onCrop: (croppedDataUrl) => {
        applyCrop(pos, src, croppedDataUrl);
        closeDialog();
      },
    });
    const captureBtn = createButton({
      label: t("screenCapture"),
      onClick: () => openScreenCapture(pos),
    });
    const dialog = createDialog({
      onClose: closeDialog,
      labelledBy: titleId,
      maxWidth: "md",
      fullWidth: true,
      children: [
        createDialogTitle({ id: titleId, children: t("image") }).el,
        createDialogContent({ children: crop.el }).el,
        createDialogActions({ children: [captureBtn.el] }).el,
      ],
    });
    activeDialog = {
      destroy: () => {
        crop.destroy();
        captureBtn.destroy();
        dialog.destroy();
      },
    };
  };

  const openAnnotation = (pos: number, src: string, annotationsStr: string | null): void => {
    closeDialog();
    activeDialog = createImageAnnotationDialog({
      t,
      src,
      annotations: parseAnnotations(annotationsStr),
      onSave: (items) => setBlockAttrs(editor, pos, { annotations: serializeAnnotations(items) }),
      onClose: closeDialog,
    });
  };

  const destroyImage = createImageBlockChrome(editor, {
    t,
    onEditCrop: (pos, { src }) => openImageCrop(pos, src),
    onAnnotate: (pos, { src, annotations }) => openAnnotation(pos, src, annotations),
    onDelete: (pos) => askDelete(pos),
  });

  // === Table: inline ops（chrome 内で vanilla 直発火）+ グリッド編集委譲 + 削除 ===============
  const tableHandle = createTableBlockChrome(editor, {
    t,
    onEdit: (pos) => {
      // vanilla スプレッドシートが無いため、consumer 未提供時はグリッド編集 no-op（inline ops で代替）。
      if (!opts.onTableEdit) return;
      tableHandle.setEditing(true);
      opts.onTableEdit({ pos, setEditing: (editing) => tableHandle.setEditing(editing) });
    },
    onDelete: (pos) => askDelete(pos),
  });

  return {
    destroy() {
      closeDialog();
      // in-flight の録画 FileReader を中断（onload の宙吊り・遅延 setBlockAttrs を防ぐ）。
      activeReader?.abort();
      activeReader = null;
      pendingSave = null;
      if (messageBound && typeof globalThis.removeEventListener === "function") {
        globalThis.removeEventListener("message", onMessage);
      }
      if (imageStorage) imageStorage.onEditImage = prevOnEditImage;
      imageEditDialogs.destroy();
      destroyGif();
      destroyImage();
      tableHandle.destroy();
    },
  };
}
