import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { NewFileInput } from "../components/explorer/inputs/NewFileInput";

describe("NewFileInput", () => {
  it("renders input field", () => {
    render(<NewFileInput depth={0} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    const input = screen.getByPlaceholderText("filenamePlaceholder");
    expect(input).toBeTruthy();
  });

  it("submits with .md extension when Enter is pressed", () => {
    const onSubmit = jest.fn();
    render(<NewFileInput depth={0} onSubmit={onSubmit} onCancel={jest.fn()} />);
    const input = screen.getByPlaceholderText("filenamePlaceholder");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("test.md");
  });

  it("does not add .md when already present", () => {
    const onSubmit = jest.fn();
    render(<NewFileInput depth={0} onSubmit={onSubmit} onCancel={jest.fn()} />);
    const input = screen.getByPlaceholderText("filenamePlaceholder");
    fireEvent.change(input, { target: { value: "test.md" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("test.md");
  });

  it("calls onCancel on Escape", () => {
    const onCancel = jest.fn();
    render(<NewFileInput depth={0} onSubmit={jest.fn()} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText("filenamePlaceholder");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel when empty on blur", () => {
    const onCancel = jest.fn();
    render(<NewFileInput depth={0} onSubmit={jest.fn()} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText("filenamePlaceholder");
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalled();
  });
});
