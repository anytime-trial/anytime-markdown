import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_COMMIT_CATEGORIES } from '@anytime-markdown/trail-core/commitCategories';
import { useTrailTheme } from './TrailThemeContext';

interface CommitCategoryContextValue {
  getCategoryColor: (prefix: string) => string;
  getCategory: (prefix: string) => number;
}

const CommitCategoryContext = createContext<CommitCategoryContextValue>({
  getCategoryColor: () => '#9E9E9E',
  getCategory: () => 2,
});

export function CommitCategoryProvider({
  categories,
  children,
}: Readonly<{
  categories?: ReadonlyMap<string, number>;
  children: React.ReactNode;
}>) {
  const { commitCategoryColors } = useTrailTheme();
  const map = categories ?? DEFAULT_COMMIT_CATEGORIES;

  const value = useMemo<CommitCategoryContextValue>(
    () => ({
      getCategory: (prefix: string) => map.get(prefix) ?? 2,
      getCategoryColor: (prefix: string) => {
        const cat = map.get(prefix) ?? 2;
        return commitCategoryColors[cat] ?? commitCategoryColors[2];
      },
    }),
    [map, commitCategoryColors],
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
