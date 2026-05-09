import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_COMMIT_CATEGORIES, DEFAULT_COMMIT_CATEGORY_LABELS } from '@anytime-markdown/trail-core/commitCategories';
import { useTrailTheme } from './TrailThemeContext';

function generateOverflowColor(index: number, isDark: boolean): string {
  const hue = Math.round((index * 137.508) % 360);
  return isDark ? `hsl(${hue}, 55%, 65%)` : `hsl(${hue}, 50%, 40%)`;
}

interface CommitCategoryContextValue {
  getCategoryColor: (prefix: string) => string;
  getCategory: (prefix: string) => number;
  getCategoryLabel: (cat: number) => string;
  getCategoryColorByIndex: (cat: number) => string;
  categoryKeys: readonly number[];
}

const CommitCategoryContext = createContext<CommitCategoryContextValue>({
  getCategoryColor: () => '#9E9E9E',
  getCategory: () => 2,
  getCategoryLabel: (cat: number) => DEFAULT_COMMIT_CATEGORY_LABELS.get(cat) ?? 'その他',
  getCategoryColorByIndex: () => '#9E9E9E',
  categoryKeys: [0, 1, 2],
});

export function CommitCategoryProvider({
  categories,
  categoryLabels,
  children,
}: Readonly<{
  categories?: ReadonlyMap<string, number>;
  categoryLabels?: ReadonlyMap<number, string>;
  children: React.ReactNode;
}>) {
  const { commitCategoryColors, isDark } = useTrailTheme();
  const map = categories ?? DEFAULT_COMMIT_CATEGORIES;
  const labels = categoryLabels ?? DEFAULT_COMMIT_CATEGORY_LABELS;

  const value = useMemo<CommitCategoryContextValue>(() => {
    const keys = Array.from(labels.keys()).sort((a, b) => a - b);
    const getColorByIndex = (cat: number): string =>
      commitCategoryColors[cat] ?? generateOverflowColor(cat, isDark);
    return {
      getCategory: (prefix: string) => {
        const fallback = keys.at(-1) ?? 2;
        return map.get(prefix) ?? fallback;
      },
      getCategoryColor: (prefix: string) => {
        const fallback = keys.at(-1) ?? 2;
        const cat = map.get(prefix) ?? fallback;
        return getColorByIndex(cat);
      },
      getCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
      getCategoryColorByIndex: getColorByIndex,
      categoryKeys: keys,
    };
  }, [map, labels, commitCategoryColors, isDark]);

  return (
    <CommitCategoryContext.Provider value={value}>
      {children}
    </CommitCategoryContext.Provider>
  );
}

export function useCommitCategory(): CommitCategoryContextValue {
  return useContext(CommitCategoryContext);
}
