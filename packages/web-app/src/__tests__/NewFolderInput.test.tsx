import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { NewFolderInput } from "../components/explorer/inputs/NewFolderInput";

describe("NewFolderInput", () => {
  it("renders input field", () => {
    render(<NewFolderInput depth={0} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const input = screen.getByPlaceholderText("folderNamePlaceholder");
    expect(input).toBeTruthy();
  });

  it("submits folder name on Enter", () => {
    const onSubmit = jest.fn();
    render(<NewFolderInput depth={0} onSubmit={onSubmit} onCancel={jest.fn()} />);
    const input = screen.getByPlaceholderText("folderNamePlaceholder");
    fireEvent.change(input, { target: { value: "myFolder" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("myFolder");
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<NewFolderInput depth={0} onSubmit={jest.fn()} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText("folderNamePlaceholder");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel when empty on blur", () => {
    const onCancel = jest.fn();
    render(<NewFolderInput depth={0} onSubmit={jest.fn()} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText("folderNamePlaceholder");
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalled();
  });
});
