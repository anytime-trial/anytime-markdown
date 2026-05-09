import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_SKILL_CATEGORIES, DEFAULT_SKILL_CATEGORY_LABELS, resolveSkillCategory } from '@anytime-markdown/trail-core/skillCategories';
import { useTrailTheme } from './TrailThemeContext';

function generateOverflowColor(index: number, isDark: boolean): string {
  const hue = Math.round((index * 137.508) % 360);
  return isDark ? `hsl(${hue}, 55%, 65%)` : `hsl(${hue}, 50%, 40%)`;
}

interface SkillCategoryContextValue {
  getSkillCategory: (skillName: string) => number;
  getSkillCategoryColor: (skillName: string) => string;
  getSkillCategoryLabel: (cat: number) => string;
  getSkillCategoryColorByIndex: (cat: number) => string;
  skillCategoryKeys: readonly number[];
}

const SkillCategoryContext = createContext<SkillCategoryContextValue>({
  getSkillCategory: () => 4,
  getSkillCategoryColor: () => 'rgba(128,128,128,0.5)',
  getSkillCategoryLabel: (cat: number) => DEFAULT_SKILL_CATEGORY_LABELS.get(cat) ?? 'その他',
  getSkillCategoryColorByIndex: () => 'rgba(128,128,128,0.5)',
  skillCategoryKeys: [0, 1, 2, 3, 4],
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
  const { skillCategoryColors, isDark } = useTrailTheme();
  const map = categories ?? DEFAULT_SKILL_CATEGORIES;
  const labels = categoryLabels ?? DEFAULT_SKILL_CATEGORY_LABELS;

  const value = useMemo<SkillCategoryContextValue>(() => {
    const keys = Array.from(labels.keys()).sort((a, b) => a - b);
    const getColorByIndex = (cat: number): string =>
      skillCategoryColors[cat] ?? generateOverflowColor(cat, isDark);
    return {
      getSkillCategory: (skillName: string) => resolveSkillCategory(skillName, map),
      getSkillCategoryColor: (skillName: string) => {
        const cat = resolveSkillCategory(skillName, map);
        return getColorByIndex(cat);
      },
      getSkillCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
      getSkillCategoryColorByIndex: getColorByIndex,
      skillCategoryKeys: keys,
    };
  }, [map, labels, skillCategoryColors, isDark]);

  return (
    <SkillCategoryContext.Provider value={value}>
      {children}
    </SkillCategoryContext.Provider>
  );
}

export function useSkillCategory(): SkillCategoryContextValue {
  return useContext(SkillCategoryContext);
}
