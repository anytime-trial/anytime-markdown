import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_SKILL_CATEGORIES, resolveSkillCategory } from '@anytime-markdown/trail-core/skillCategories';
import { useTrailTheme } from './TrailThemeContext';

interface SkillCategoryContextValue {
  getSkillCategory: (skillName: string) => number;
  getSkillCategoryColor: (skillName: string) => string;
}

const SkillCategoryContext = createContext<SkillCategoryContextValue>({
  getSkillCategory: () => 4,
  getSkillCategoryColor: () => 'rgba(128,128,128,0.5)',
});

export function SkillCategoryProvider({
  categories,
  children,
}: Readonly<{
  categories?: ReadonlyMap<string, number>;
  children: React.ReactNode;
}>) {
  const { skillCategoryColors } = useTrailTheme();
  const map = categories ?? DEFAULT_SKILL_CATEGORIES;

  const value = useMemo<SkillCategoryContextValue>(
    () => ({
      getSkillCategory: (skillName: string) => resolveSkillCategory(skillName, map),
      getSkillCategoryColor: (skillName: string) => {
        const cat = resolveSkillCategory(skillName, map);
        return skillCategoryColors[cat] ?? skillCategoryColors[4];
      },
    }),
    [map, skillCategoryColors],
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
