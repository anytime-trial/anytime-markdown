import { render, screen, fireEvent } from "@testing-library/react";
import { EditorSettingsPanel } from "../components/EditorSettingsPanel";
import { DEFAULT_SETTINGS } from "../useEditorSettings";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ja",
}));

jest.mock("@/hooks/useConfirm", () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

const t = (key: string) => key;

function renderPanel(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    settings: { ...DEFAULT_SETTINGS },
    updateSettings: jest.fn(),
    resetSettings: jest.fn(),
    t,
    ...overrides,
  };
  const { container } = render(<EditorSettingsPanel {...props} />);
  return { ...props, container };
}

describe("EditorSettingsPanel", () => {
  test("フォントサイズスライダーが表示される", () => {
    renderPanel();
    expect(screen.getByRole("slider", { name: "settingFontSize" })).toBeTruthy();
  });

  test("スペルチェックのラベルが表示される", () => {
    renderPanel();
    expect(screen.getByText("settingSpellCheck")).toBeTruthy();
  });

  test("テーブル幅の切替ボタンが表示される", () => {
    renderPanel();
    expect(screen.getByRole("group", { name: "tableWidthSelect" })).toBeTruthy();
  });

  test("リセットボタンが表示される", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "settingReset" })).toBeTruthy();
  });

  test("open=false のとき非表示", () => {
    renderPanel({ open: false });
    expect(screen.queryByText("editorSettings")).toBeNull();
  });
});
