/**
 * chrome/fileHandlers（toolbar のファイル操作ハンドラ束の組み立て）の特性化テスト。
 *
 * installChrome から切り出した時点では「override があればそれ、無ければ既定」という選択が
 * 14 個並ぶだけで、どれか 1 つの綴りを間違えても型は通り、既存の統合テストも大半は緑のままになる
 * （ボタンが出ない / 押しても何も起きない、という静かな壊れ方をする）。ここで選択表そのものを固定する。
 */
import { buildFileHandlers } from "../host/chrome/fileHandlers";
import type { FileOpsController } from "../host/fileOpsController";

function createFileOpsStub(overrides: Partial<FileOpsController> = {}): FileOpsController {
  return {
    getFullMarkdown: () => "# body",
    getFileName: () => "doc.md",
    hasSaveTarget: () => true,
    openFile: jest.fn(async () => {}),
    saveFile: jest.fn(async () => {}),
    saveAsFile: jest.fn(async () => {}),
    newFile: jest.fn(async () => {}),
    clearAll: jest.fn(async () => {}),
    selectFile: jest.fn(async () => {}),
    importFile: jest.fn(async () => {}),
    confirmContinue: jest.fn(async () => true),
    markDirty: jest.fn(),
    adoptExternalFile: jest.fn(),
    ...overrides,
  } as unknown as FileOpsController;
}

function build(
  args: Partial<Parameters<typeof buildFileHandlers>[0]> = {},
  fileOps = createFileOpsStub(),
): ReturnType<typeof buildFileHandlers> {
  return buildFileHandlers({
    fileOps,
    overrides: undefined,
    liveOverrides: () => undefined,
    fileSystemProvider: undefined,
    hasExternalSave: false,
    capabilities: undefined,
    externalSaveKind: undefined,
    openWebImport: jest.fn(),
    ...args,
  });
}

describe("buildFileHandlers", () => {
  it("override が渡されていればそれをそのまま採用する（既定で包まない）", () => {
    const onDownload = jest.fn();
    const onImport = jest.fn();
    const onClear = jest.fn();
    const onNewFile = jest.fn();
    const onWebImport = jest.fn();
    const { fileHandlers } = build({
      overrides: { onDownload, onImport, onClear, onNewFile, onWebImport },
    });

    expect(fileHandlers.onDownload).toBe(onDownload);
    expect(fileHandlers.onImport).toBe(onImport);
    expect(fileHandlers.onClear).toBe(onClear);
    expect(fileHandlers.onNewFile).toBe(onNewFile);
    expect(fileHandlers.onWebImport).toBe(onWebImport);
  });

  it("override 専用の 4 つは既定を持たず、未指定なら undefined のまま渡る", () => {
    const { fileHandlers } = build();
    expect(fileHandlers.onSaveToDrive).toBeUndefined();
    expect(fileHandlers.onExportPdf).toBeUndefined();
    expect(fileHandlers.onLoadRightFile).toBeUndefined();
    expect(fileHandlers.onExportRightFile).toBeUndefined();
  });

  it("override 未指定の既定は fileOps へ委譲する", () => {
    const fileOps = createFileOpsStub();
    const { fileHandlers } = build({}, fileOps);

    fileHandlers.onClear();
    expect(fileOps.clearAll).toHaveBeenCalled();
    fileHandlers.onNewFile?.();
    expect(fileOps.newFile).toHaveBeenCalled();
  });

  it("既定の onWebImport は渡された openWebImport を呼ぶ", () => {
    const openWebImport = jest.fn();
    const { fileHandlers } = build({ openWebImport });
    fileHandlers.onWebImport?.();
    expect(openWebImport).toHaveBeenCalledTimes(1);
  });

  describe("保存先の有無による出し分け", () => {
    it("provider も onExternalSave も無ければ 開く / 保存 / 名前を付けて保存 は undefined", () => {
      const { fileHandlers } = build();
      expect(fileHandlers.onOpenFile).toBeUndefined();
      expect(fileHandlers.onSaveFile).toBeUndefined();
      expect(fileHandlers.onSaveAsFile).toBeUndefined();
    });

    it("onExternalSave だけなら 上書き保存のみ 有効（開く / 名前を付けて保存 は出さない）", () => {
      const { fileHandlers } = build({ hasExternalSave: true });
      expect(fileHandlers.onSaveFile).toBeDefined();
      expect(fileHandlers.onOpenFile).toBeUndefined();
      expect(fileHandlers.onSaveAsFile).toBeUndefined();
    });

    it("provider があれば 開く / 保存 / 名前を付けて保存 がすべて有効", () => {
      const fileOps = createFileOpsStub();
      const { fileHandlers } = build(
        { fileSystemProvider: { supportsDirectAccess: true } as never },
        fileOps,
      );
      fileHandlers.onOpenFile?.();
      fileHandlers.onSaveFile?.();
      fileHandlers.onSaveAsFile?.();
      expect(fileOps.openFile).toHaveBeenCalled();
      expect(fileOps.saveFile).toHaveBeenCalled();
      expect(fileOps.saveAsFile).toHaveBeenCalled();
    });
  });

  describe("Drive / GitHub から開く（未保存ガード付き）", () => {
    it("override が無ければラップもしない", () => {
      const { fileHandlers } = build();
      expect(fileHandlers.onOpenFromDrive).toBeUndefined();
      expect(fileHandlers.onOpenFromGitHub).toBeUndefined();
    });

    it("継続が拒否されたら本体を呼ばない", async () => {
      const onOpenFromDrive = jest.fn();
      const fileOps = createFileOpsStub({ confirmContinue: jest.fn(async () => false) });
      const { fileHandlers } = build(
        { overrides: { onOpenFromDrive }, liveOverrides: () => ({ onOpenFromDrive }) },
        fileOps,
      );

      await fileHandlers.onOpenFromDrive?.();
      expect(fileOps.confirmContinue).toHaveBeenCalled();
      expect(onOpenFromDrive).not.toHaveBeenCalled();
    });

    it("継続が承認されたら本体を呼ぶ。呼ぶのは live 解決した最新の override", async () => {
      const atBuild = jest.fn();
      const latest = jest.fn();
      const { fileHandlers } = build({
        overrides: { onOpenFromGitHub: atBuild },
        // ホストが live update でハンドラを差し替えた状況
        liveOverrides: () => ({ onOpenFromGitHub: latest }),
      });

      await fileHandlers.onOpenFromGitHub?.();
      expect(latest).toHaveBeenCalledTimes(1);
      expect(atBuild).not.toHaveBeenCalled();
    });
  });

  describe("fileCapabilities", () => {
    it("ホスト指定があればそれを使い、宛先種別だけ被せる", () => {
      const { fileCapabilities } = build({
        capabilities: { hasSaveTarget: false, supportsDirectAccess: true },
        externalSaveKind: "github",
      });
      expect(fileCapabilities).toEqual({
        hasSaveTarget: false,
        supportsDirectAccess: true,
        externalSaveKind: "github",
      });
    });

    it("ホスト未指定なら fileOps と provider から導出する", () => {
      const fileOps = createFileOpsStub({ hasSaveTarget: () => true });
      const { fileCapabilities } = build(
        { fileSystemProvider: { supportsDirectAccess: false } as never },
        fileOps,
      );
      expect(fileCapabilities).toEqual({
        hasSaveTarget: true,
        supportsDirectAccess: false,
        externalSaveOnly: false,
        externalSaveKind: undefined,
      });
    });

    it("provider 無し + onExternalSave ありは externalSaveOnly になる", () => {
      const { fileCapabilities } = build({ hasExternalSave: true });
      expect(fileCapabilities.externalSaveOnly).toBe(true);
    });
  });
});
