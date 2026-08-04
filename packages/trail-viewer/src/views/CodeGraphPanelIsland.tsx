/**
 * CodeGraphPanelIsland — CodeGraphPanel を mountReactIsland（vanilla→React 橋渡し）から
 * マウントできるよう、必要な React context provider で包む。
 *
 * `PromptManagerIsland` と同形。`CodeGraphPanel` は `useTrailI18n` を使うため、
 * `TrailLocaleProvider` の外でレンダーすると実行時に throw する。
 *
 * この島が存在する理由（2026-08-05）: コードグラフパネルには props 供給元が 2 つあり、
 * 実際にマウントされていた c4Viewer 側が Time Scrubber / State Replay /
 * Snapshot per Commit / Auto Playback / Author Heatmap に必要な props を渡していなかったため、
 * 5 機能が実行時に到達できなかった。供給元を `CodeGraphPanel` 1 本へ寄せ、
 * c4Viewer は島を立てるだけにする。
 */
import { TrailLocaleProvider } from '../i18n';
import type { TrailLocale } from '../i18n';
import { CodeGraphPanel } from '../components/CodeGraphPanel';

export interface CodeGraphPanelIslandProps {
  readonly serverUrl: string;
  readonly isDark?: boolean;
  /** 対象リポジトリ。未指定だと取得系がすべて無効になり、パネルは `no-repo` を出す。 */
  readonly repoName?: string;
  readonly locale?: TrailLocale;
}

export function CodeGraphPanelIsland({
  serverUrl,
  isDark,
  repoName,
  locale,
}: Readonly<CodeGraphPanelIslandProps>): React.ReactElement {
  return (
    <TrailLocaleProvider locale={locale}>
      {/*
        ゴーストエッジ（temporal coupling）は渡さない。C4 のポップアップは元から
        `ghostEdgesEnabled: false` 固定で、ここで有効化すると本修正の範囲外の
        挙動変更になる。`CodeGraphPanel` は未指定なら無効の既定値を使う。
      */}
      <CodeGraphPanel serverUrl={serverUrl} isDark={isDark} repoName={repoName} />
    </TrailLocaleProvider>
  );
}
