/**
 * FallbackFileSystemProvider のユニットテスト
 *
 * DOM 操作をモックし、ファイルの open/save/saveAs を検証する。
 */

import { FallbackFileSystemProvider } from "../lib/FallbackFileSystemProvider";

describe("FallbackFileSystemProvider", () => {
  let provider: FallbackFileSystemProvider;

  beforeEach(() => {
    provider = new FallbackFileSystemProvider();
  });

  it("supportsDirectAccess が false を返す", () => {
    expect(provider.supportsDirectAccess).toBe(false);
  });

  describe("open", () => {
    it("ファイルを選択すると handle と content を返す", async () => {
      const mockFile = { name: "test.md", text: () => Promise.resolve("# Hello") };
      const mockInput = {
        type: "",
        accept: "",
        onchange: null as (() => void) | null,
        oncancel: null as (() => void) | null,
        click: jest.fn(),
        files: [mockFile],
      };
      jest.spyOn(document, "createElement").mockReturnValue(mockInput as unknown as HTMLElement);

      const promise = provider.open();
      // onchange をトリガー
      mockInput.onchange!();

      const result = await promise;
      expect(result).toEqual({ handle: { name: "test.md" }, content: "# Hello" });
      expect(mockInput.click).toHaveBeenCalled();
      expect(mockInput.accept).toBe(".md,text/markdown,text/plain");
    });

    it("ファイル未選択時は null を返す", async () => {
      const mockInput = {
        type: "",
        accept: "",
        onchange: null as (() => void) | null,
        oncancel: null as (() => void) | null,
        click: jest.fn(),
        files: [] as unknown[],
      };
      jest.spyOn(document, "createElement").mockReturnValue(mockInput as unknown as HTMLElement);

      const promise = provider.open();
      mockInput.onchange!();

      const result = await promise;
      expect(result).toBeNull();
    });

    it("キャンセル時は null を返す", async () => {
      const mockInput = {
        type: "",
        accept: "",
        onchange: null as (() => void) | null,
        oncancel: null as (() => void) | null,
        click: jest.fn(),
      };
      jest.spyOn(document, "createElement").mockReturnValue(mockInput as unknown as HTMLElement);

      const promise = provider.open();
      mockInput.oncancel!();

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe("saveAs", () => {
    it("Blob ダウンロードリンクを作成してクリックする", async () => {
      const mockAnchor = { href: "", download: "", click: jest.fn() };
      const mockCreateObjectURL = jest.fn().mockReturnValue("blob:test");
      const mockRevokeObjectURL = jest.fn();

      jest.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const result = await provider.saveAs("# Content");

      expect(result).toBeNull();
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockAnchor.href).toBe("blob:test");
      expect(mockAnchor.download).toMatch(/^document_\d{8}_\d{6}\.md$/);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test");
    });
  });

  describe("save", () => {
    it("saveAs を呼び出す", async () => {
      const spy = jest.spyOn(provider, "saveAs").mockResolvedValue(null);
      await provider.save({ name: "test.md" }, "# Content");
      expect(spy).toHaveBeenCalledWith("# Content");
    });
  });
});
