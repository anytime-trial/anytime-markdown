/**
 * ui/Dialog.tsx の a11y / フォーカス / スクロールロックのスモークテスト。
 * jest-dom は未導入のため素の DOM API で検証する。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Dialog } from "../ui/Dialog";

describe("Dialog", () => {
  it("open=false では何も描画しない", () => {
    render(
      <Dialog open={false} onClose={() => {}}>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open=true で role=dialog / aria-modal / aria-label を出す", () => {
    render(
      <Dialog open onClose={() => {}} aria-label="テスト">
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("テスト");
  });

  it("Escape で onClose を呼ぶ", () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} aria-label="x">
        <p>body</p>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop クリックで onClose を呼ぶ", () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} aria-label="x">
        <p>body</p>
      </Dialog>,
    );
    const backdrop = document.querySelector<HTMLElement>(".backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open でダイアログ内の最初の focusable へフォーカスを移す", () => {
    render(
      <Dialog open onClose={() => {}} aria-label="x">
        <button type="button">ok</button>
      </Dialog>,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "ok" }));
  });

  it("背景スクロールをロックし、閉じると元に戻す", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} aria-label="x">
        <p>body</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Dialog open={false} onClose={() => {}} aria-label="x">
        <p>body</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
