/**
 * EditorErrorBoundary のユニットテスト
 */

import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { EditorErrorBoundary } from "../components/EditorErrorBoundary";

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test error");
  return <div>Content</div>;
}

describe("EditorErrorBoundary", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("子コンポーネントを正常にレンダリングする", () => {
    render(
      <EditorErrorBoundary>
        <div>Hello</div>
      </EditorErrorBoundary>,
    );
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("エラー発生時にエラーメッセージを表示する", () => {
    render(
      <EditorErrorBoundary>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Test error")).toBeTruthy();
  });

  it("再読み込みボタンでエラー状態をリセットする", () => {
    // shouldThrowを外部で制御
    let shouldThrow = true;
    function Controlled() {
      if (shouldThrow) throw new Error("Test error");
      return <div>Content</div>;
    }

    render(
      <EditorErrorBoundary>
        <Controlled />
      </EditorErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();

    // エラーをリセットした後は投げないようにする
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "エディタを再読み込み" }));

    expect(screen.getByText("Content")).toBeTruthy();
  });

  it("onError コールバックが呼ばれる", () => {
    const onError = jest.fn();
    render(
      <EditorErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
  });
});
