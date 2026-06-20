import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Collapse, ExpandLess, ExpandMore, List, ListItemButton, ListItemText, Typography } from '../ui';

import type { TrailPromptEntry } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { buildPromptTree } from './messages/promptTree';
import { LazyPromptMarkdownPreview } from './shared/LazyPromptMarkdownPreview';
import { useTrailTheme } from './TrailThemeContext';

export interface PromptManagerProps {
  readonly prompts: readonly TrailPromptEntry[];
  readonly isDark: boolean;
  readonly locale?: string;
}

const PROMPT_LIST_WIDTH = 320;

export function PromptManager({
  prompts,
  isDark,
  locale,
}: Readonly<PromptManagerProps>) {
  const { colors, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const promptTree = useMemo(() => buildPromptTree(prompts), [prompts]);
  const [collapsedCategories, setCollapsedCategories] = useState<ReadonlySet<string>>(new Set());
  const selected = prompts.find((p) => p.id === selectedId);

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number>(0);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPreviewHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleCategory = (category: string): void => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Box
        sx={{
          width: PROMPT_LIST_WIDTH,
          minWidth: PROMPT_LIST_WIDTH,
          borderRight: 1,
          borderColor: colors.border,
          overflowY: 'auto',
          ...scrollbarSx,
        }}
      >
        <List dense disablePadding>
          {promptTree.map((group) => {
            const collapsed = collapsedCategories.has(group.category);
            return (
              <Box key={group.category}>
                <ListItemButton
                  onClick={() => toggleCategory(group.category)}
                  sx={{ py: 0.5, bgcolor: colors.sectionBg }}
                >
                  <ListItemText
                    primary={group.category}
                    secondary={`${group.prompts.length} files`}
                    primaryTypographyProps={{
                      variant: 'subtitle2',
                      sx: { textTransform: 'none' },
                    }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  {collapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
                </ListItemButton>
                <Collapse in={!collapsed} timeout="auto" unmountOnExit>
                  <List dense disablePadding>
                    {group.prompts.map((prompt) => (
                      <ListItemButton
                        key={prompt.id}
                        selected={prompt.id === selectedId}
                        onClick={() => setSelectedId(prompt.id)}
                        sx={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          py: 1,
                          pl: 3,
                          // TODO(mui-removal): dropped pseudo sx — '&.Mui-selected', '&.Mui-selected:hover', '&:hover' are pseudo-selector keys not expressible as inline style
                        }}
                      >
                        <Typography variant="subtitle2" noWrap sx={{ width: '100%' }}>
                          {prompt.name}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          {prompt.tags.map((tag) => (
                            <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ borderColor: colors.iceBlue, color: colors.iceBlue }} />
                          ))}
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{ mt: 0.5, color: colors.textSecondary }}
                        >
                          {new Date(prompt.updatedAt).toLocaleDateString()}
                        </Typography>
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
        {prompts.length === 0 && (
          <Typography
            variant="body2"
            sx={{ p: 2, textAlign: 'center', color: colors.textSecondary }}
          >
            {t('prompt.noPrompts')}
          </Typography>
        )}
      </Box>

      <Box ref={previewContainerRef} sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {selected ? (
          previewHeight > 0 ? (
            <LazyPromptMarkdownPreview
              content={selected.content}
              isDark={isDark}
              locale={locale}
              height={previewHeight}
              contentKey={selected.id}
            />
          ) : null
        ) : (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              {t('prompt.selectPrompt')}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
