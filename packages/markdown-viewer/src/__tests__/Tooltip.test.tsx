/**
 * ui/Tooltip.tsx の a11y / 開閉スモークテスト。
 * jest-dom は未導入のため素の DOM API で検証する。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { Tooltip } from "../ui/Tooltip";

describe("Tooltip", () => {
  it("hover で role=tooltip を表示し aria-describedby を張る", async () => {
    render(
      <Tooltip title="ヒント">
        <button type="button">btn</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(btn.getAttribute("aria-describedby")).toBeNull();

    await act(async () => {
      fireEvent.mouseEnter(btn);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toBe("ヒント");
    expect(btn.getAttribute("aria-describedby")).toBe(tip.id);

    await act(async () => {
      fireEvent.mouseLeave(btn);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("focus / blur でも開閉する", async () => {
    render(
      <Tooltip title="フォーカス">
        <button type="button">b</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button");
    await act(async () => {
      fireEvent.focus(btn);
    });
    expect(screen.getByRole("tooltip").textContent).toBe("フォーカス");
    await act(async () => {
      fireEvent.blur(btn);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("子の既存イベントハンドラを保持する", async () => {
    const onMouseEnter = jest.fn();
    render(
      <Tooltip title="t">
        <button type="button" onMouseEnter={onMouseEnter}>
          b
        </button>
      </Tooltip>,
    );
    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole("button"));
    });
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });
});
