import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_TOOL_CATEGORIES, DEFAULT_TOOL_CATEGORY_LABELS, resolveToolCategory } from '@anytime-markdown/trail-core/toolCategories';
import { useTrailTheme } from './TrailThemeContext';

function generateOverflowColor(index: number, isDark: boolean): string {
  const hue = Math.round((index * 137.508) % 360);
  return isDark ? `hsl(${hue}, 55%, 65%)` : `hsl(${hue}, 50%, 40%)`;
}

interface ToolCategoryContextValue {
  getToolCategory: (toolName: string) => number;
  getToolCategoryColor: (toolName: string) => string;
  getToolCategoryLabel: (cat: number) => string;
  getToolCategoryColorByIndex: (cat: number) => string;
  toolCategoryKeys: readonly number[];
}

const ToolCategoryContext = createContext<ToolCategoryContextValue>({
  getToolCategory: () => 4,
  getToolCategoryColor: () => 'rgba(128,128,128,0.5)',
  getToolCategoryLabel: (cat: number) => DEFAULT_TOOL_CATEGORY_LABELS.get(cat) ?? 'その他',
  getToolCategoryColorByIndex: () => 'rgba(128,128,128,0.5)',
  toolCategoryKeys: [0, 1, 2, 3, 4],
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
  const { toolCategoryColors, isDark } = useTrailTheme();
  const map = categories ?? DEFAULT_TOOL_CATEGORIES;
  const labels = categoryLabels ?? DEFAULT_TOOL_CATEGORY_LABELS;

  const value = useMemo<ToolCategoryContextValue>(() => {
    const keys = Array.from(labels.keys()).sort((a, b) => a - b);
    const getColorByIndex = (cat: number): string =>
      toolCategoryColors[cat] ?? generateOverflowColor(cat, isDark);
    return {
      getToolCategory: (toolName: string) => resolveToolCategory(toolName, map),
      getToolCategoryColor: (toolName: string) => {
        const cat = resolveToolCategory(toolName, map);
        return getColorByIndex(cat);
      },
      getToolCategoryLabel: (cat: number) => labels.get(cat) ?? 'その他',
      getToolCategoryColorByIndex: getColorByIndex,
      toolCategoryKeys: keys,
    };
  }, [map, labels, toolCategoryColors, isDark]);

  return (
    <ToolCategoryContext.Provider value={value}>
      {children}
    </ToolCategoryContext.Provider>
  );
}

export function useToolCategory(): ToolCategoryContextValue {
  return useContext(ToolCategoryContext);
}
