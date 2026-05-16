export interface ToolCategoryEntry {
  readonly category: number;
  readonly description: string;
}

export interface ToolCategoriesFile {
  readonly categories: Record<string, string>;
  readonly entries: Record<string, ToolCategoryEntry>;
}
