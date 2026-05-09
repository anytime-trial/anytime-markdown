import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_TOOL_CATEGORIES, resolveToolCategory } from '@anytime-markdown/trail-core/toolCategories';
import { useTrailTheme } from './TrailThemeContext';

interface ToolCategoryContextValue {
  getToolCategory: (toolName: string) => number;
  getToolCategoryColor: (toolName: string) => string;
}

const ToolCategoryContext = createContext<ToolCategoryContextValue>({
  getToolCategory: () => 4,
  getToolCategoryColor: () => 'rgba(128,128,128,0.5)',
});

export function ToolCategoryProvider({
  categories,
  children,
}: Readonly<{
  categories?: ReadonlyMap<string, number>;
  children: React.ReactNode;
}>) {
  const { toolCategoryColors } = useTrailTheme();
  const map = categories ?? DEFAULT_TOOL_CATEGORIES;

  const value = useMemo<ToolCategoryContextValue>(
    () => ({
      getToolCategory: (toolName: string) => resolveToolCategory(toolName, map),
      getToolCategoryColor: (toolName: string) => {
        const cat = resolveToolCategory(toolName, map);
        return toolCategoryColors[cat] ?? toolCategoryColors[4];
      },
    }),
    [map, toolCategoryColors],
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
