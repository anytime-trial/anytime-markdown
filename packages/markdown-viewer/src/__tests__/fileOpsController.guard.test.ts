/**
 * fileOpsController の未保存ガード（guardDirty）と newFile のユニットテスト。
 *
 * editor / 変換ユーティリティは mock する（本テストの対象は分岐制御のみ）。
 * confirmSave（3 択）注入時と未注入時（既存 confirm への 2 択フォールバック）の双方を固定する。
 */

jest.mock("../utils/clearEditor", () => ({ clearDocumentAndComments: jest.fn() }));
jest.mock("../utils/editorContentLoader", () => ({
  applyMarkdownToEditor: jest.fn(() => ({ frontmatter: null })),
}));
jest.mock("../utils/markdownSerializer", () => ({ getMarkdownFromEditorSafe: jest.fn(() => "body") }));
jest.mock("../utils/frontmatterHelpers", () => ({ prependFrontmatter: (md: string) => md }));
jest.mock("../utils/fileHandleStore", () => ({
  clearNativeHandle: jest.fn(() => Promise.resolve()),
  loadNativeHandle: jest.fn(() => Promise.resolve(null)),
  saveNativeHandle: jest.fn(() => Promise.resolve()),
}));

import { createFileOpsController } from "../host/fileOpsController";
import type { FileSystemProvider } from "../types/fileSystem";

const t = (key: string) => key;

/** provider の open/save/saveAs 呼び出しを記録する。saveAs は handle を返す（成功）。 */
function createProvider(over: Partial<FileSystemProvider> = {}): FileSystemProvider {
  return {
    supportsDirectAccess: true,
    open: jest.fn(() => Promise.resolve({ handle: { name: "opened.md" }, content: "# opened" })),
    save: jest.fn(() => Promise.resolve()),
    saveAs: jest.fn(() => Promise.resolve({ name: "saved.md" })),
    ...over,
  } as unknown as FileSystemProvider;
}

function createOps(over: Record<string, unknown> = {}) {
  const editor = { isEmpty: false } as never;
  let frontmatter: string | null = null;
  let sourceText = "";
  const ops = createFileOpsController({
    editor,
    t,
    getFrontmatter: () => frontmatter,
    setFrontmatter: (fm: string | null) => { frontmatter = fm; },
    getSourceMode: () => false,
    getSourceText: () => sourceText,
    setSourceText: (s: string) => { sourceText = s; },
    ...over,
  } as never);
  return ops;
}

describe("fileOpsController — 未保存ガード", () => {
  it("dirty でなければ確認せず新規作成する", async () => {
    const confirmSave = jest.fn();
    const ops = createOps({ provider: createProvider(), confirmSave });
    await ops.newFile();
    expect(confirmSave).not.toHaveBeenCalled();
    expect(ops.hasSaveTarget()).toBe(false);
  });

  it("dirty かつ cancel なら中断し dirty を保つ", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("cancel" as const));
    const provider = createProvider();
    const ops = createOps({ provider, confirmSave });
    ops.markDirty();

    await ops.newFile();

    expect(confirmSave).toHaveBeenCalledWith("unsavedConfirm");
    expect(ops.isDirty()).toBe(true);
    expect(provider.saveAs).not.toHaveBeenCalled();
  });

  it("dirty かつ discard なら保存せず続行する", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("discard" as const));
    const provider = createProvider();
    const ops = createOps({ provider, confirmSave });
    ops.markDirty();

    await ops.newFile();

    expect(provider.saveAs).not.toHaveBeenCalled();
    expect(ops.isDirty()).toBe(false);
  });

  it("dirty かつ save でファイル未オープンなら saveAs へフォールバックしてから続行する", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    const provider = createProvider();
    const ops = createOps({ provider, confirmSave });
    ops.markDirty();

    await ops.newFile();

    expect(provider.saveAs).toHaveBeenCalledTimes(1);
    expect(ops.isDirty()).toBe(false);
    expect(ops.hasSaveTarget()).toBe(false); // newFile 後は handle がリセットされる
  });

  it("save を選んだが保存がキャンセルされたら続行しない", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    // saveAs が null → ユーザーが保存ダイアログをキャンセル
    const provider = createProvider({ saveAs: jest.fn(() => Promise.resolve(null)) as never });
    const ops = createOps({ provider, confirmSave });
    ops.markDirty();

    await ops.newFile();

    expect(ops.isDirty()).toBe(true);
  });

  it("confirmSave 未注入なら既存 confirm の 2 択へフォールバックする", async () => {
    const confirm = jest.fn(() => Promise.resolve(false));
    const ops = createOps({ provider: createProvider(), confirm });
    ops.markDirty();

    await ops.newFile();

    expect(confirm).toHaveBeenCalledWith("unsavedConfirm");
    expect(ops.isDirty()).toBe(true);
  });

  it("openFile も dirty 時にガードし、cancel なら provider.open を呼ばない", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("cancel" as const));
    const provider = createProvider();
    const ops = createOps({ provider, confirmSave });
    ops.markDirty();

    await ops.openFile();

    expect(provider.open).not.toHaveBeenCalled();
    expect(ops.isDirty()).toBe(true);
  });

  it("openFile は dirty でなければ確認なしで開く", async () => {
    const confirmSave = jest.fn();
    const provider = createProvider();
    const ops = createOps({ provider, confirmSave });

    await ops.openFile();

    expect(confirmSave).not.toHaveBeenCalled();
    expect(provider.open).toHaveBeenCalledTimes(1);
    expect(ops.isDirty()).toBe(false);
  });

  it("外部保存ホストが void を返す（同期ホスト）なら従来どおり続行する", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    const onExternalSave = jest.fn();
    const ops = createOps({ confirmSave, onExternalSave });
    ops.markDirty();

    await ops.newFile();

    expect(onExternalSave).toHaveBeenCalledTimes(1);
    expect(ops.isDirty()).toBe(false);
  });

  it("外部保存が true を解決したら続行する", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    const onExternalSave = jest.fn(() => Promise.resolve(true));
    const ops = createOps({ confirmSave, onExternalSave });
    ops.markDirty();

    await ops.newFile();

    expect(ops.isDirty()).toBe(false);
  });

  it("外部保存が false を解決したら（コミットメッセージのキャンセル・409 競合など）本文を破棄しない", async () => {
    const { clearDocumentAndComments } = jest.requireMock("../utils/clearEditor");
    clearDocumentAndComments.mockClear();
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    const onExternalSave = jest.fn(() => Promise.resolve(false));
    const ops = createOps({ confirmSave, onExternalSave });
    ops.markDirty();

    await ops.newFile();

    expect(onExternalSave).toHaveBeenCalledTimes(1);
    expect(ops.isDirty()).toBe(true);
    expect(clearDocumentAndComments).not.toHaveBeenCalled();
  });

  it("外部保存が reject したら本文を破棄しない", async () => {
    const { clearDocumentAndComments } = jest.requireMock("../utils/clearEditor");
    clearDocumentAndComments.mockClear();
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    const onExternalSave = jest.fn(() => Promise.reject(new Error("network")));
    const ops = createOps({ confirmSave, onExternalSave });
    ops.markDirty();

    await ops.newFile();

    expect(ops.isDirty()).toBe(true);
    expect(clearDocumentAndComments).not.toHaveBeenCalled();
  });

  it("外部保存が false を解決したら openFile も中断する", async () => {
    const confirmSave = jest.fn(() => Promise.resolve("save" as const));
    const provider = createProvider();
    const ops = createOps({ provider, confirmSave, onExternalSave: () => Promise.resolve(false) });
    ops.markDirty();

    await ops.openFile();

    expect(provider.open).not.toHaveBeenCalled();
    expect(ops.isDirty()).toBe(true);
  });
});

describe("fileOpsController — hasSaveTarget", () => {
  it("ローカルハンドルが無くても onExternalSave があれば保存先ありとみなす（Drive から開いた本文）", () => {
    const ops = createOps({ provider: createProvider(), onExternalSave: jest.fn() });
    expect(ops.hasSaveTarget()).toBe(true);
  });

  it("ローカルハンドルも onExternalSave も無ければ保存先なし", () => {
    const ops = createOps({ provider: createProvider() });
    expect(ops.hasSaveTarget()).toBe(false);
  });
});

describe("fileOpsController — newFile", () => {
  it("本文・frontmatter・fileHandle をリセットし dirty を落とす", async () => {
    const { clearDocumentAndComments } = jest.requireMock("../utils/clearEditor");
    const provider = createProvider();
    const ops = createOps({ provider });
    await ops.openFile(); // handle を持たせる
    expect(ops.hasSaveTarget()).toBe(true);

    await ops.newFile();

    expect(clearDocumentAndComments).toHaveBeenCalled();
    expect(ops.hasSaveTarget()).toBe(false);
    expect(ops.getFileName()).toBeNull();
    expect(ops.isDirty()).toBe(false);
  });

  it("clearAll は従来どおり clearConfirm で確認する（newFile とは別経路）", async () => {
    const confirm = jest.fn(() => Promise.resolve(true));
    const ops = createOps({ provider: createProvider(), confirm });

    await ops.clearAll();

    expect(confirm).toHaveBeenCalledWith("clearConfirm");
  });
});
