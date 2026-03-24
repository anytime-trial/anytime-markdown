/**
 * LineNumberTextarea のユニットテスト
 */

import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { LineNumberTextarea } from "../components/LineNumberTextarea";

const defaultProps = {
  value: "line1\nline2\nline3",
  onChange: jest.fn(),
  fontSize: 14,
  lineHeight: 1.5,
  isDark: false,
};

describe("LineNumberTextarea", () => {
  it("テキストエリアをレンダリングする", () => {
    render(<LineNumberTextarea {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeTruthy();
  });

  it("行番号を表示する", () => {
    render(<LineNumberTextarea {...defaultProps} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("onChange が呼ばれる", () => {
    const onChange = jest.fn();
    render(<LineNumberTextarea {...defaultProps} onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "new text" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("readOnly モードでレンダリングされる", () => {
    render(<LineNumberTextarea {...defaultProps} readOnly />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveProperty("readOnly", true);
  });

  it("placeholder が表示される", () => {
    render(<LineNumberTextarea {...defaultProps} value="" placeholder="Enter text" />);
    const textarea = screen.getByPlaceholderText("Enter text");
    expect(textarea).toBeTruthy();
  });

  it("ダークモードでレンダリングされる", () => {
    render(<LineNumberTextarea {...defaultProps} isDark={true} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeTruthy();
  });
});
