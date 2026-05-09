import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_TOOL_CATEGORIES, DEFAULT_TOOL_CATEGORY_LABELS, resolveToolCategory } from '@anytime-markdown/trail-core/toolCategories';
import { useTrailTheme } from './TrailThemeContext';

interface ToolCategoryContextValue {
  getToolCategory: (toolName: string) => number;
  getToolCategoryColor: (toolName: string) => string;
  getToolCategoryLabel: (cat: number) => string;
}

const ToolCategoryContext = createContext<ToolCategoryContextValue>({
  getToolCategory: () => 4,
  getToolCategoryColor: () => 'rgba(128,128,128,0.5)',
  getToolCategoryLabel: (cat: number) => DEFAULT_TOOL_CATEGORY_LABELS.get(cat) ?? 'その他',
});

export function ToolCategoryProvider({
  categories,
  categoryLabels,
  children,
}: Readonly<{
  categories?: ReadonlyMap<string, number>;
  categoryLabels?: ReadonlyMap<number, string>;
  children: React.ReactNode;
}>) {
  const { toolCategoryColors } = useTrailTheme();
  const map = categories ?? DEFAULT_TOOL_CATEGORIES;
  const labels = categoryLabels ?? DEFAULT_TOOL_CATEGORY_LABELS;

  const value = useMemo<ToolCategoryContextValue>(
    () => ({
      getToolCategory: (toolName: string) => resolveToolCategory(toolName, map),
      getToolCategoryColor: (toolName: string) => {
        const cat = resolveToolCategory(toolName, map);
        return toolCategoryColors[cat] ?? toolCategoryColors[4];
      },
      getToolCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
    }),
    [map, labels, toolCategoryColors],
  );

  return (
    <ToolCategoryContext.Provider value={value}>
      {children}
    </ToolCategoryContext.Provider>
  );
}

export function useToolCategory(): ToolCategoryContextValue {
  return useContext(ToolCategoryContext);
}
