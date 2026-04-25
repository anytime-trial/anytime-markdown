'use client';

import dynamic from 'next/dynamic';

import { useThemeMode } from '../providers';
import { BriefingPrimary, BriefingSecondary } from './components/Briefing';
import { Caravan } from './components/Caravan';
import { Colophon } from './components/Colophon';
import { CtaActions, CtaStrip } from './components/CtaStrip';
import { Dispatch } from './components/Dispatch';
import { Headline } from './components/Headline';
import { Masthead } from './components/Masthead';
import { ProgressRule } from './components/ProgressRule';
import { PullQuote } from './components/PullQuote';
import { Ticker } from './components/Ticker';
import { bodoni, jetbrains, shippori } from './fonts';
import styles from './press.module.css';

const TrailViewerEmbed = dynamic(
  () =>
    import('../trail/components/TrailViewer').then((m) => ({
      default: m.TrailViewer,
    })),
  { ssr: false },
);

const MarkdownViewerEmbed = dynamic(
  () => import('../components/MarkdownViewer'),
  { ssr: false },
);

const MARKDOWN_PREVIEW_HEIGHT = 'clamp(300px, 42vh, 520px)';

export function PressBody() {
  const { themeMode } = useThemeMode();
  const fontClasses = `${bodoni.variable} ${shippori.variable} ${jetbrains.variable}`;
  return (
    <div className={`${styles.root} ${fontClasses}`} data-cp-mode={themeMode}>
      <ProgressRule />
      <Masthead />
      <Headline />
      <Caravan />
      <Dispatch />
      <BriefingPrimary
        embed={<TrailViewerEmbed containerHeight="clamp(300px, 42vh, 520px)" />}
      />
      <BriefingSecondary
        embed={
          <div style={{ height: MARKDOWN_PREVIEW_HEIGHT, overflow: 'hidden' }}>
            <MarkdownViewerEmbed
              docKey="docs/markdownAll/markdownAll.ja.md"
              docKeyByLocale={{ en: 'docs/markdownAll/markdownAll.en.md' }}
              minHeight={MARKDOWN_PREVIEW_HEIGHT}
              showFrontmatter
            />
          </div>
        }
        embedActions={<CtaActions />}
      />
      <PullQuote />
      <Ticker />
      <CtaStrip />
      <Colophon />
    </div>
  );
}
