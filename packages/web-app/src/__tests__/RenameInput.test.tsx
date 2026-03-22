import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { RenameInput } from "../components/explorer/inputs/RenameInput";

describe("RenameInput", () => {
  it("renders with current name", () => {
    render(<RenameInput currentName="test.md" isDir={false} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const input = screen.getByDisplayValue("test.md");
    expect(input).toBeTruthy();
  });

  it("submits new name on Enter", () => {
    const onSubmit = jest.fn();
    render(<RenameInput currentName="old.md" isDir={false} onSubmit={onSubmit} onCancel={jest.fn()} />);
    const input = screen.getByDisplayValue("old.md");
    fireEvent.change(input, { target: { value: "new.md" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("new.md");
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<RenameInput currentName="test.md" isDir={false} onSubmit={jest.fn()} onCancel={onCancel} />);
    const input = screen.getByDisplayValue("test.md");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel when name unchanged on blur", () => {
    const onCancel = jest.fn();
    render(<RenameInput currentName="test.md" isDir={false} onSubmit={jest.fn()} onCancel={onCancel} />);
    const input = screen.getByDisplayValue("test.md");
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalled();
  });
});
