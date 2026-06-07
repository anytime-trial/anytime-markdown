/**
 * ui/Drawer.tsx の a11y / フォーカス / スクロールロックのスモークテスト。
 * jest-dom は未導入のため素の DOM API で検証する。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Drawer } from "../ui/Drawer";

describe("Drawer", () => {
  it("open=false では何も描画しない", () => {
    render(
      <Drawer open={false} onClose={() => {}}>
        <p>body</p>
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open=true で role=dialog / aria-modal / aria-label を出す", () => {
    render(
      <Drawer open onClose={() => {}} aria-label="テスト">
        <p>body</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("テスト");
  });

  it("aria-labelledby は presentation ルートに付与する（VR ロケータと一致）", () => {
    render(
      <Drawer open onClose={() => {}} aria-labelledby="panel-title">
        <h2 id="panel-title">タイトル</h2>
      </Drawer>,
    );
    const root = document.querySelector<HTMLElement>('[aria-labelledby="panel-title"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("role")).toBe("presentation");
    // ロケータが一意であること（paper には labelledby を付けない）。
    expect(document.querySelectorAll('[aria-labelledby="panel-title"]').length).toBe(1);
  });

  it("anchor=right で paper に right クラスが付く", () => {
    render(
      <Drawer open onClose={() => {}} anchor="right" aria-label="x">
        <p>body</p>
      </Drawer>,
    );
    expect(screen.getByRole("dialog").className).toContain("right");
  });

  it("width を paper の style.width に反映する", () => {
    render(
      <Drawer open onClose={() => {}} width={320} aria-label="x">
        <p>body</p>
      </Drawer>,
    );
    expect(screen.getByRole("dialog").style.width).toBe("320px");
  });

  it("Escape で onClose を呼ぶ", () => {
    const onClose = jest.fn();
    render(
      <Drawer open onClose={onClose} aria-label="x">
        <p>body</p>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop クリックで onClose を呼ぶ", () => {
    const onClose = jest.fn();
    render(
      <Drawer open onClose={onClose} aria-label="x">
        <p>body</p>
      </Drawer>,
    );
    const backdrop = document.querySelector<HTMLElement>(".backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open でドロワー内の最初の focusable へフォーカスを移す", () => {
    render(
      <Drawer open onClose={() => {}} aria-label="x">
        <button type="button">ok</button>
      </Drawer>,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "ok" }));
  });

  it("背景スクロールをロックし、閉じると元に戻す", () => {
    const { rerender } = render(
      <Drawer open onClose={() => {}} aria-label="x">
        <p>body</p>
      </Drawer>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Drawer open={false} onClose={() => {}} aria-label="x">
        <p>body</p>
      </Drawer>,
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("印刷時に隠すため root に data-print-hide を付ける", () => {
    render(
      <Drawer open onClose={() => {}} aria-labelledby="t">
        <h2 id="t">x</h2>
      </Drawer>,
    );
    const root = document.querySelector<HTMLElement>('[aria-labelledby="t"]');
    expect(root?.hasAttribute("data-print-hide")).toBe(true);
  });
});
