'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { useThemeMode } from '../providers';
import { AgentPanelMock } from './components/AgentPanelMock';
import { BriefingAgent, BriefingPrimary, BriefingRoadmap, BriefingSecondary } from './components/Briefing';
import { Caravan } from './components/Caravan';
import { Colophon } from './components/Colophon';
import { CtaActions } from './components/CtaStrip';
import { Dispatch } from './components/Dispatch';
import { GithubTrending } from './components/GithubTrending';
import { Headline } from './components/Headline';
import { Masthead } from './components/Masthead';
import { PressDocsSection } from './components/PressDocsSection';
import { PressReports } from './components/PressReports';
import { ProgressRule } from './components/ProgressRule';
import { PullQuote } from './components/PullQuote';
import { SpotifyCharts } from './components/SpotifyCharts';
import { Ticker } from './components/Ticker';
import { TodaysNews } from './components/TodaysNews';
import { WeatherForecast } from './components/WeatherForecast';
import { WsjNews } from './components/WsjNews';
import { bodoni, jetbrains, shippori, yujiBoku } from './fonts';
import styles from './press.module.css';

const FONT_CLASSES = `${bodoni.variable} ${shippori.variable} ${jetbrains.variable} ${yujiBoku.variable}`;

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
  const tCta = useTranslations('press.cta');
  return (
    <div className={`${styles.root} ${FONT_CLASSES}`} data-cp-mode={themeMode}>
      <ProgressRule />
      <Masthead />
      <Headline />
      <Caravan />
      <Dispatch />
      <BriefingAgent
        subtitle="- セッション"
        embed={<AgentPanelMock />}
        embedActions={
          <CtaActions
            primaryLabel={tCta('vsCode')}
            secondaryLabel="GitHub"
            primaryHref="https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent"
            secondaryHref="https://github.com/anytime-trial/anytime-markdown/tree/master/packages/vscode-agent-extension"
            primaryExternal
          />
        }
      />
      <BriefingPrimary
        subtitle="- アクティビティ"
        trailKeys={['trail2', 'trail3', 'trail5', 'trail6']}
        embed={<TrailViewerEmbed containerHeight="clamp(400px, 62vh, 760px)" />}
        embedActions={
          <CtaActions
            primaryLabel={tCta('openViewer')}
            secondaryLabel={tCta('vsCode')}
            primaryHref="/trail"
            secondaryHref="https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail"
          />
        }
      />
      <BriefingPrimary
        subtitle="- メッセージ"
        trailKeys={['trail3', 'trail7']}
        embed={<TrailViewerEmbed containerHeight="clamp(400px, 62vh, 760px)" initialTab={1} />}
        embedActions={
          <CtaActions
            primaryLabel={tCta('openViewer')}
            secondaryLabel={tCta('vsCode')}
            primaryHref="/trail?tab=1"
            secondaryHref="https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail"
          />
        }
      />
      <BriefingPrimary
        subtitle="- モデル"
        trailKeys={['trail1', 'trail8', 'trail9', 'trail10', 'trail11']}
        embed={<TrailViewerEmbed containerHeight="clamp(400px, 62vh, 760px)" initialTab={4} initialC4Level={2} />}
        embedActions={
          <CtaActions
            primaryLabel={tCta('openViewer')}
            secondaryLabel={tCta('vsCode')}
            primaryHref="/trail?tab=4&c4level=2"
            secondaryHref="https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail"
          />
        }
      />
      <BriefingPrimary
        subtitle="- スキル"
        trailKeys={['trail4', 'trail12', 'trail13']}
        embed={null}
      />
      <BriefingRoadmap
        subtitle="- 将来対応"
        trailKeys={[
          'trail14',
          'trail15',
          'trail16',
          'trail17',
          'trail18',
          'trail19',
          'trail20',
          'trail21',
          'trail22',
          'trail23',
          'trail24',
          'trail25',
          'trail26',
        ]}
        verdict="— planned"
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
        embedActions={
          <CtaActions
            primaryLabel={tCta('onlineEditor')}
            secondaryLabel={tCta('vsCode')}
            primaryHref="/markdown"
            secondaryHref="https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown"
          />
        }
      />
      <PullQuote />
      <TodaysNews />
      <WsjNews />
      <PressReports />
      <GithubTrending />
      <SpotifyCharts />
      <PressDocsSection />
      <WeatherForecast />
      <Ticker />
      <Colophon />
    </div>
  );
}
