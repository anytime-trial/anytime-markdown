/**
 * ReadonlyToolbar.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";

import { ReadonlyToolbar } from "../components/ReadonlyToolbar";

const t = (key: string) => key;

describe("ReadonlyToolbar", () => {
  it("renders without crashing", () => {
    const { container } = render(
        <>
        <ReadonlyToolbar
          outlineOpen={false}
          onToggleOutline={jest.fn()}
          fontSize={14}
          onFontSizeChange={jest.fn()}
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with outlineOpen", () => {
    const { container } = render(
        <>
        <ReadonlyToolbar
          outlineOpen={true}
          onToggleOutline={jest.fn()}
          fontSize={16}
          onFontSizeChange={jest.fn()}
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });
});
