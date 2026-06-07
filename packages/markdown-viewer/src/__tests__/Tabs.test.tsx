/**
 * ui/Tabs.tsx + ui/Tab.tsx のスモークテスト。role / aria-selected / onChange(value) を検証する。
 * jest-dom は未導入のため素の DOM API で検証する。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Tabs } from "../ui/Tabs";
import { Tab } from "../ui/Tab";

describe("Tabs / Tab", () => {
  function renderTabs(value: string, onChange = jest.fn()) {
    render(
      <Tabs value={value} onChange={onChange}>
        <Tab value="code" label="Code" />
        <Tab value="config" label="Config" />
      </Tabs>,
    );
    return onChange;
  }

  it("role=tablist と role=tab を出す", () => {
    renderTabs("code");
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("選択中タブに aria-selected=true、他は false", () => {
    renderTabs("config");
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("クリックで onChange(event, value) を発火する", () => {
    const onChange = renderTabs("code");
    fireEvent.click(screen.getByText("Config"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe("config");
  });

  it("選択中タブのみ tabIndex=0、非選択は -1", () => {
    renderTabs("code");
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");
  });
});
