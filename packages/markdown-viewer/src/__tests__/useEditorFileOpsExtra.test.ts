/**
 * useEditorFileOps.ts の追加テスト
 * NotificationKey 型と追加ケースをテスト
 */
import type { NotificationKey } from "../hooks/useEditorFileOps";

describe("NotificationKey type", () => {
  it("accepts valid notification keys", () => {
    const keys: NotificationKey[] = [
      "copiedToClipboard",
      "fileSaved",
      "pdfExportError",
      "encodingError",
      "saveError",
      null,
    ];
    expect(keys).toHaveLength(6);
    expect(keys[5]).toBeNull();
  });
});
