/* Mock .md imports that slashCommandItems.ts depends on */
jest.mock("../constants/templates/apiSpec.md", () => "", { virtual: true });
jest.mock("../constants/templates/basicDesign.md", () => "", {
  virtual: true,
});
jest.mock("../constants/templates/markdownAll.md", () => "", {
  virtual: true,
});
jest.mock("../constants/templates/markdownAll-en.md", () => "", {
  virtual: true,
});
jest.mock("../constants/templates/welcome.md", () => "", { virtual: true });
jest.mock("../constants/templates/welcome-en.md", () => "", {
  virtual: true,
});

import type { SlashCommandItem } from "../extensions/slashCommandItems";
import { filterSlashItems } from "../extensions/slashCommandItems";

const mockT = (key: string): string => {
  const map: Record<string, string> = {
    slashH1: "Heading 1",
    slashH2: "Heading 2",
    slashTable: "Table",
    slashMermaid: "Mermaid",
    slashDate: "Date",
  };
  return map[key] || key;
};

const noop = () => {};

const mockItems: SlashCommandItem[] = [
  {
    id: "heading1",
    labelKey: "slashH1",
    icon: null as unknown as React.ReactElement,
    keywords: ["h1", "heading", "title", "見出し"],
    action: noop,
  },
  {
    id: "heading2",
    labelKey: "slashH2",
    icon: null as unknown as React.ReactElement,
    keywords: ["h2", "heading", "subtitle", "見出し"],
    action: noop,
  },
  {
    id: "table",
    labelKey: "slashTable",
    icon: null as unknown as React.ReactElement,
    keywords: ["table", "テーブル", "表"],
    action: noop,
  },
  {
    id: "mermaid",
    labelKey: "slashMermaid",
    icon: null as unknown as React.ReactElement,
    keywords: ["mermaid", "diagram", "chart", "図"],
    action: noop,
  },
  {
    id: "date",
    labelKey: "slashDate",
    icon: null as unknown as React.ReactElement,
    keywords: ["date", "today", "日付", "きょう", "今日"],
    action: noop,
  },
];

describe("filterSlashItems", () => {
  it("returns all items when query is empty", () => {
    expect(filterSlashItems(mockItems, "", mockT)).toEqual(mockItems);
  });

  it("matches label case-insensitively", () => {
    const result = filterSlashItems(mockItems, "heading", mockT);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(["heading1", "heading2"]);
  });

  it("matches label with different casing", () => {
    const result = filterSlashItems(mockItems, "TABLE", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("table");
  });

  it("matches keyword case-insensitively", () => {
    const result = filterSlashItems(mockItems, "Diagram", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mermaid");
  });

  it("matches Japanese keywords", () => {
    const result = filterSlashItems(mockItems, "見出し", mockT);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(["heading1", "heading2"]);
  });

  it("matches Japanese keyword テーブル", () => {
    const result = filterSlashItems(mockItems, "テーブル", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("table");
  });

  it("matches partial keyword", () => {
    const result = filterSlashItems(mockItems, "dia", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mermaid");
  });

  it("returns empty array when nothing matches", () => {
    const result = filterSlashItems(mockItems, "zzzznotfound", mockT);
    expect(result).toEqual([]);
  });

  it("returns multiple items when query matches several", () => {
    const result = filterSlashItems(mockItems, "dat", mockT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("date");
  });

  it("matches multiple items via shared keyword", () => {
    const result = filterSlashItems(mockItems, "h", mockT);
    // "h" matches label "Heading 1", "Heading 2" and keywords containing "h"
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
