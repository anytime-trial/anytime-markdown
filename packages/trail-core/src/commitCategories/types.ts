export interface CommitCategoryEntry {
  readonly category: number;
  readonly description: string;
}

export interface CommitCategoriesFile {
  readonly categories: Record<string, string>;
  readonly entries: Record<string, CommitCategoryEntry>;
}
