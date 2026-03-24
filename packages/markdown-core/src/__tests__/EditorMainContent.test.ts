import { readFileSync } from "fs";
import { resolve } from "path";

describe("EditorMainContent", () => {
  // EditorContentArea は EditorMainContent から分離されたエディタ本体コンポーネント
  const src = readFileSync(
    resolve(__dirname, "../components/EditorContentArea.tsx"),
    "utf-8",
  );

  test("settings を Context 経由で取得している（useEditorSettings() を直接呼ばない）", () => {
    // リグレッション: useEditorSettings() を直接呼ぶと独立した state が生成され、
    // 設定パネルの変更がリアルタイム反映されないバグが発生する
    expect(src).toContain("useEditorSettingsContext");
    expect(src).not.toMatch(/useEditorSettings\(\)/);
  });
});
