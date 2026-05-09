import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_COMMIT_CATEGORIES, DEFAULT_COMMIT_CATEGORY_LABELS } from '@anytime-markdown/trail-core/commitCategories';
import { useTrailTheme } from './TrailThemeContext';

interface CommitCategoryContextValue {
  getCategoryColor: (prefix: string) => string;
  getCategory: (prefix: string) => number;
  getCategoryLabel: (cat: number) => string;
}

const CommitCategoryContext = createContext<CommitCategoryContextValue>({
  getCategoryColor: () => '#9E9E9E',
  getCategory: () => 2,
  getCategoryLabel: (cat: number) => DEFAULT_COMMIT_CATEGORY_LABELS.get(cat) ?? 'その他',
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
  const { commitCategoryColors } = useTrailTheme();
  const map = categories ?? DEFAULT_COMMIT_CATEGORIES;
  const labels = categoryLabels ?? DEFAULT_COMMIT_CATEGORY_LABELS;

  const value = useMemo<CommitCategoryContextValue>(
    () => ({
      getCategory: (prefix: string) => map.get(prefix) ?? 2,
      getCategoryColor: (prefix: string) => {
        const cat = map.get(prefix) ?? 2;
        return commitCategoryColors[cat] ?? commitCategoryColors[2];
      },
      getCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
    }),
    [map, labels, commitCategoryColors],
  );

  return (
    <CommitCategoryContext.Provider value={value}>
      {children}
    </CommitCategoryContext.Provider>
  );
}

export function useCommitCategory(): CommitCategoryContextValue {
  return useContext(CommitCategoryContext);
}
