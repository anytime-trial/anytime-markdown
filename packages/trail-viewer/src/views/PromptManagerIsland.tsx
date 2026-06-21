/**
 * PromptManagerIsland — wraps PromptManager with required React context providers
 * so it can be mounted via mountReactIsland (vanilla→React bridge) without needing
 * a full React tree above it.
 */
import { TrailThemeProvider } from '../components/TrailThemeContext';
import { TrailLocaleProvider } from '../i18n';
import type { TrailLocale } from '../i18n';
import { PromptManager } from '../components/PromptManager';
import type { PromptManagerProps } from '../components/PromptManager';

export interface PromptManagerIslandProps extends PromptManagerProps {
  readonly locale?: TrailLocale;
}

export function PromptManagerIsland({
  prompts,
  isDark,
  locale,
}: Readonly<PromptManagerIslandProps>): React.ReactElement {
  return (
    <TrailLocaleProvider locale={locale}>
      <TrailThemeProvider isDark={isDark}>
        <PromptManager prompts={prompts} isDark={isDark} locale={locale} />
      </TrailThemeProvider>
    </TrailLocaleProvider>
  );
}
