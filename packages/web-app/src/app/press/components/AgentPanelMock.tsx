import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

interface MockSession {
  title: string;
  branch: string;
  commits: number;
  warn?: boolean;
}

/**
 * Anytime Agent の「Agent マッピング」パネルを模した静的イラスト。
 *
 * Web 版の live viewer が存在しないため、実スクリーンショットの代わりに
 * 紙面トークン（--ink / --paper-fold / --vermilion 等）で構成したテーマ追従の mock を描く。
 * 実プロダクトのスクショが用意できれば本コンポーネントを差し替える想定。
 */
const MOCK_SESSIONS: readonly MockSession[] = [
  { title: 'feature/landing-agent', branch: 'feature/landing-agent', commits: 12, warn: true },
  { title: 'fix/trail-drift-detect', branch: 'fix/trail-drift-detect', commits: 4 },
  { title: 'refactor/viewer-vanilla', branch: 'refactor/viewer-vanilla', commits: 7 },
  { title: 'docs/spec-sync', branch: 'develop', commits: 2 },
];

export function AgentPanelMock() {
  const t = useTranslations('press.agent');
  return (
    <div className={styles.agentMock} aria-hidden="true">
      <div className={styles.agentMockToolbar}>
        <span className={styles.agentMockToolbarTitle}>{t('mockPanelTitle')}</span>
        <span className={styles.agentMockToolbarMeta}>
          {t('mockPanelMeta', { count: MOCK_SESSIONS.length })}
        </span>
      </div>
      <ul className={styles.agentMockList}>
        {MOCK_SESSIONS.map((session) => (
          <li key={session.branch} className={styles.agentMockRow}>
            <span className={styles.agentMockDot} />
            <span className={styles.agentMockTitle}>{session.title}</span>
            <span className={styles.agentMockBranch}>
              <span className={styles.agentMockBranchGlyph}>⎇</span>
              {session.branch}
            </span>
            <span className={styles.agentMockCommits}>{session.commits} commits</span>
            {session.warn ? (
              <span className={styles.agentMockWarn}>⚠ {t('mockWarnBadge')}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
