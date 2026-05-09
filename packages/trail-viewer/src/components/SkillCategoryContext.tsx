import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_SKILL_CATEGORIES, DEFAULT_SKILL_CATEGORY_LABELS, resolveSkillCategory } from '@anytime-markdown/trail-core/skillCategories';
import { useTrailTheme } from './TrailThemeContext';

interface SkillCategoryContextValue {
  getSkillCategory: (skillName: string) => number;
  getSkillCategoryColor: (skillName: string) => string;
  getSkillCategoryLabel: (cat: number) => string;
}

const SkillCategoryContext = createContext<SkillCategoryContextValue>({
  getSkillCategory: () => 4,
  getSkillCategoryColor: () => 'rgba(128,128,128,0.5)',
  getSkillCategoryLabel: (cat: number) => DEFAULT_SKILL_CATEGORY_LABELS.get(cat) ?? 'その他',
});

export function SkillCategoryProvider({
  categories,
  categoryLabels,
  children,
}: Readonly<{
  categories?: ReadonlyMap<string, number>;
  categoryLabels?: ReadonlyMap<number, string>;
  children: React.ReactNode;
}>) {
  const { skillCategoryColors } = useTrailTheme();
  const map = categories ?? DEFAULT_SKILL_CATEGORIES;
  const labels = categoryLabels ?? DEFAULT_SKILL_CATEGORY_LABELS;

  const value = useMemo<SkillCategoryContextValue>(
    () => ({
      getSkillCategory: (skillName: string) => resolveSkillCategory(skillName, map),
      getSkillCategoryColor: (skillName: string) => {
        const cat = resolveSkillCategory(skillName, map);
        return skillCategoryColors[cat] ?? skillCategoryColors[4];
      },
      getSkillCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
    }),
    [map, labels, skillCategoryColors],
  );

  return (
    <SkillCategoryContext.Provider value={value}>
      {children}
    </SkillCategoryContext.Provider>
  );
}

export function useSkillCategory(): SkillCategoryContextValue {
  return useContext(SkillCategoryContext);
}
