import type { FileSystemProvider } from "../../types/fileSystem";
import type { ToolbarFileCapabilities, ToolbarFileHandlers } from "../../types/toolbar";
import type { ExternalSaveKind } from "../../utils/externalSaveKind";
import type { FileOpsController } from "../fileOpsController";

/**
 * toolbar が使うファイル操作ハンドラ束の組み立て。
 *
 * 「ホストが渡した override があればそれ、無ければ fileOps / editor / blob ベースの既定」という
 * 選択が 14 個並ぶだけの構造だが、`??` と条件付き `undefined` の入れ子でここだけが installChrome
 * の認知的複雑度の大半を占めていた（実測: 本セクションを外すと installChrome の CC は 128 → 42）。
 *
 * override の有無による分岐は **組み立て時**に決まる（元実装と同じ）。一方、override 本体の呼び出しは
 * live update で `current.fileHandlers` が差し替わる可能性があるため、getter 経由で都度解決する。
 */

export interface FileHandlersOptions {
  readonly fileOps: FileOpsController;
  /** ホストが渡した override（組み立て時のスナップショット。分岐判定に使う）。 */
  readonly overrides: Partial<ToolbarFileHandlers> | undefined;
  /** 呼び出し時点の override（live update で差し替わりうるものを都度解決する）。 */
  readonly liveOverrides: () => Partial<ToolbarFileHandlers> | undefined;
  readonly fileSystemProvider: FileSystemProvider | null | undefined;
  /** `onExternalSave` が配線されているか（外部保存のみのホストの判定に使う）。 */
  readonly hasExternalSave: boolean;
  /** ホストが `fileCapabilities` を明示していればそれを使い、未指定なら fileOps から導出する。 */
  readonly capabilities: ToolbarFileCapabilities | undefined;
  readonly externalSaveKind: ExternalSaveKind | undefined;
  /** Web インポートダイアログ（既定の onWebImport）。 */
  readonly openWebImport: () => void;
}

export interface FileHandlersBundle {
  readonly fileHandlers: ToolbarFileHandlers;
  readonly fileCapabilities: ToolbarFileCapabilities;
}

/** 既定のダウンロード: 全文を Blob にして a[download] で落とす。 */
function createDefaultDownload(fileOps: FileOpsController): () => void {
  return () => {
    const md = fileOps.getFullMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileOps.getFileName() ?? "untitled.md";
    a.click();
    URL.revokeObjectURL(url);
  };
}

/** toolbar の import ボタン（引数なし）: ファイルピッカー → 確認付き取り込み。 */
function createDefaultImportClick(fileOps: FileOpsController): () => void {
  return () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown,text/plain";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void fileOps.selectFile(file);
    });
    input.click();
  };
}

/**
 * fileOps の外側で文書を差し替えるホスト経路（Drive / GitHub から開く）に未保存ガードを掛ける。
 * override が無ければラップもしない（`undefined` のまま toolbar へ渡し、ボタンを出さない）。
 */
function guardExternalOpen(
  present: boolean,
  fileOps: FileOpsController,
  resolve: () => (() => void | Promise<void>) | undefined,
): (() => Promise<void>) | undefined {
  if (!present) return undefined;
  return async () => {
    if (!(await fileOps.confirmContinue())) return;
    await resolve()?.();
  };
}

export function buildFileHandlers(options: FileHandlersOptions): FileHandlersBundle {
  const {
    fileOps,
    overrides,
    liveOverrides,
    fileSystemProvider,
    hasExternalSave,
    capabilities,
    externalSaveKind,
    openWebImport,
  } = options;

  const canOpenLocally = !!fileSystemProvider;
  const canSave = canOpenLocally || hasExternalSave;

  const fileHandlers: ToolbarFileHandlers = {
    onDownload: overrides?.onDownload ?? createDefaultDownload(fileOps),
    onImport: overrides?.onImport ?? createDefaultImportClick(fileOps),
    onClear: overrides?.onClear ?? (() => void fileOps.clearAll()),
    onOpenFile: overrides?.onOpenFile ?? (canOpenLocally ? () => void fileOps.openFile() : undefined),
    onOpenFromDrive: guardExternalOpen(
      !!overrides?.onOpenFromDrive,
      fileOps,
      () => liveOverrides()?.onOpenFromDrive,
    ),
    onOpenFromGitHub: guardExternalOpen(
      !!overrides?.onOpenFromGitHub,
      fileOps,
      () => liveOverrides()?.onOpenFromGitHub,
    ),
    onNewFile: overrides?.onNewFile ?? (() => void fileOps.newFile()),
    onSaveToDrive: overrides?.onSaveToDrive,
    onSaveFile: overrides?.onSaveFile ?? (canSave ? () => void fileOps.saveFile() : undefined),
    onSaveAsFile:
      overrides?.onSaveAsFile ?? (canOpenLocally ? () => void fileOps.saveAsFile() : undefined),
    onWebImport: overrides?.onWebImport ?? openWebImport,
    onExportPdf: overrides?.onExportPdf,
    onLoadRightFile: overrides?.onLoadRightFile,
    onExportRightFile: overrides?.onExportRightFile,
  };

  const fileCapabilities: ToolbarFileCapabilities = {
    ...(capabilities ?? {
      hasSaveTarget: fileOps.hasSaveTarget(),
      supportsDirectAccess: fileSystemProvider?.supportsDirectAccess ?? false,
      externalSaveOnly: !fileSystemProvider && hasExternalSave,
    }),
    externalSaveKind,
  };

  return { fileHandlers, fileCapabilities };
}
