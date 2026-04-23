import { render, screen } from "@testing-library/react";
import React from "react";

import { SpreadsheetEditor } from "../SpreadsheetEditor";

jest.mock("next-intl", () => ({
    useTranslations: (ns: string) => (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const messages = require("../i18n/ja.json") as Record<string, Record<string, string>>;
        return messages[ns]?.[key] ?? key;
    },
}));

describe("SpreadsheetEditor", () => {
    it("renders import/export buttons in Japanese", () => {
        render(<SpreadsheetEditor themeMode="light" />);
        expect(screen.getByText("CSV を読み込む")).toBeTruthy();
        expect(screen.getByText("CSV をダウンロード")).toBeTruthy();
        expect(screen.getByText("TSV を読み込む")).toBeTruthy();
        expect(screen.getByText("TSV をダウンロード")).toBeTruthy();
    });
});
