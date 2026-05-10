import { render, screen } from "@testing-library/react";
import React from "react";

import { SpreadsheetEditor } from "../SpreadsheetEditor";

describe("SpreadsheetEditor", () => {
    it("renders import/export buttons in Japanese (default locale)", () => {
        render(<SpreadsheetEditor themeMode="light" locale="ja" />);
        expect(screen.getByText("CSV を読み込む")).toBeTruthy();
        expect(screen.getByText("CSV をダウンロード")).toBeTruthy();
        expect(screen.getByText("TSV を読み込む")).toBeTruthy();
        expect(screen.getByText("TSV をダウンロード")).toBeTruthy();
    });
});
