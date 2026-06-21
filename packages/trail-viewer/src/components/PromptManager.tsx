import { useEffect, useRef, useState } from 'react';

import type { TrailPromptEntry } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { LazyPromptMarkdownPreview } from './shared/LazyPromptMarkdownPreview';
import { mountPromptManagerSidebar, type PromptManagerSidebarProps } from '../views/promptManager';

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
}: Readonly<PromptManagerProps>): React.ReactElement {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number>(0);

  const selected = prompts.find((p) => p.id === selectedId);

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

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const sidebarProps: PromptManagerSidebarProps = {
    prompts,
    selectedId,
    onSelect: setSelectedId,
    t: tStr,
    colors: {
      textSecondary: colors.textSecondary,
      border: colors.border,
      sectionBg: colors.sectionBg,
      iceBlue: colors.iceBlue,
      hoverBg: colors.hoverBg,
      activeBg: colors.activeBg,
      iceBlueBorder: colors.iceBlueBorder,
    },
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ width: PROMPT_LIST_WIDTH, minWidth: PROMPT_LIST_WIDTH, borderRight: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        <VanillaIsland mount={mountPromptManagerSidebar} props={sidebarProps} />
      </div>
      <div ref={previewContainerRef} style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {t('prompt.selectPrompt')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
