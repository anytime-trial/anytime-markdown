/**
 * fs/webFileSystemProvider.ts — File System Access API ベースの FileSystemProvider。
 *
 * supportsDirectAccess の判定、open / save / saveAs の各ブランチ（正常系・未対応・
 * ユーザーキャンセル=AbortError・その他エラーのログ出力）を検証する。
 */
import { WebFileSystemProvider } from "../fs/webFileSystemProvider";

/** 一時的に globalThis へ FS API を生やす。 */
function withGlobal(name: string, value: unknown, run: () => Promise<void>): Promise<void> {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  return run().finally(() => {
    delete (globalThis as Record<string, unknown>)[name];
  });
}

/** supportsDirectAccess を true に固定したサブクラス（API モック注入時の判定回避）。 */
class DirectAccessProvider extends WebFileSystemProvider {
  override get supportsDirectAccess(): boolean {
    return true;
  }
}

describe("WebFileSystemProvider", () => {
  let provider: WebFileSystemProvider;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new WebFileSystemProvider();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("supportsDirectAccess", () => {
    it("showOpenFilePicker が無ければ false（jsdom 既定）", () => {
      expect(provider.supportsDirectAccess).toBe(false);
    });

    it("showOpenFilePicker があれば true", async () => {
      await withGlobal("showOpenFilePicker", jest.fn(), async () => {
        expect(new WebFileSystemProvider().supportsDirectAccess).toBe(true);
      });
    });
  });

  describe("open", () => {
    it("未対応（false）なら null", async () => {
      expect(await provider.open()).toBeNull();
    });

    it("正常に開けたら FileOpenResult を返す", async () => {
      const mockFile = { name: "test.md", text: jest.fn().mockResolvedValue("# Hello") };
      const mockHandle = { name: "test.md", getFile: jest.fn().mockResolvedValue(mockFile) };
      await withGlobal("showOpenFilePicker", jest.fn().mockResolvedValue([mockHandle]), async () => {
        const result = await new WebFileSystemProvider().open();
        expect(result).not.toBeNull();
        expect(result!.handle.name).toBe("test.md");
        expect(result!.content).toBe("# Hello");
        expect(result!.handle.nativeHandle).toBe(mockHandle);
      });
    });

    it("ユーザーキャンセル（AbortError）は null・ログ出力しない", async () => {
      await withGlobal(
        "showOpenFilePicker",
        jest.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
        async () => {
          expect(await new DirectAccessProvider().open()).toBeNull();
          expect(errorSpy).not.toHaveBeenCalled();
        },
      );
    });

    it("その他エラーは null・console.error でログ出力", async () => {
      await withGlobal(
        "showOpenFilePicker",
        jest.fn().mockRejectedValue(new Error("permission denied")),
        async () => {
          expect(await new DirectAccessProvider().open()).toBeNull();
          expect(errorSpy).toHaveBeenCalled();
        },
      );
    });
  });

  describe("save（上書き）", () => {
    it("nativeHandle が無ければ何もしない（throw しない）", async () => {
      await expect(provider.save({ name: "test.md" }, "content")).resolves.toBeUndefined();
    });

    it("createWritable で書き込み close する（上書き保存）", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      const close = jest.fn().mockResolvedValue(undefined);
      const nativeHandle = {
        name: "test.md",
        createWritable: jest.fn().mockResolvedValue({ write, close }),
      };
      await provider.save({ name: "test.md", nativeHandle }, "# Content");
      expect(nativeHandle.createWritable).toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith("# Content");
      expect(close).toHaveBeenCalled();
    });
  });

  describe("saveAs", () => {
    it("未対応（false）なら null", async () => {
      expect(await provider.saveAs("content")).toBeNull();
    });

    it("新規ファイルとして書き込み FileHandle を返す", async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      const close = jest.fn().mockResolvedValue(undefined);
      const mockHandle = {
        name: "document.md",
        createWritable: jest.fn().mockResolvedValue({ write, close }),
      };
      await withGlobal("showSaveFilePicker", jest.fn().mockResolvedValue(mockHandle), async () => {
        const result = await new DirectAccessProvider().saveAs("# New");
        expect(result!.name).toBe("document.md");
        expect(result!.nativeHandle).toBe(mockHandle);
        expect(write).toHaveBeenCalledWith("# New");
      });
    });

    it("ユーザーキャンセル（AbortError）は null・ログ出力しない", async () => {
      await withGlobal(
        "showSaveFilePicker",
        jest.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
        async () => {
          expect(await new DirectAccessProvider().saveAs("content")).toBeNull();
          expect(errorSpy).not.toHaveBeenCalled();
        },
      );
    });

    it("その他エラーは null・console.error でログ出力", async () => {
      await withGlobal(
        "showSaveFilePicker",
        jest.fn().mockRejectedValue(new Error("io error")),
        async () => {
          expect(await new DirectAccessProvider().saveAs("content")).toBeNull();
          expect(errorSpy).toHaveBeenCalled();
        },
      );
    });
  });
});
