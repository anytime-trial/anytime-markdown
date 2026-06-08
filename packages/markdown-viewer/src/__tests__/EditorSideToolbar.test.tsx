/**
 * EditorSideToolbar.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SIDE_TOOLBAR_ICON_SIZE: 20,
  SIDE_TOOLBAR_WIDTH: 40,
}));

import { EditorSideToolbar } from "../components/EditorSideToolbar";

const t = (key: string) => key;

describe("EditorSideToolbar", () => {
  it("renders without crashing", () => {
    const { container } = render(
        <>
        <EditorSideToolbar
          sourceMode={false}
          outlineOpen={false}
          commentOpen={false}
          onToggleComment={jest.fn()}
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with all options enabled", () => {
    const { container } = render(
        <>
        <EditorSideToolbar
          sourceMode={true}
          outlineOpen={true}
          commentOpen={true}
          explorerOpen={true}
          onToggleOutline={jest.fn()}
          onToggleComment={jest.fn()}
          onToggleExplorer={jest.fn()}
          onOpenSettings={jest.fn()}
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });
});
