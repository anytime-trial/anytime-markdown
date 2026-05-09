export interface SkillCategoryEntry { readonly category: number; readonly description: string; }
export interface SkillCategoriesFile { readonly categories: Record<string, string>; readonly entries: Record<string, SkillCategoryEntry>; }
