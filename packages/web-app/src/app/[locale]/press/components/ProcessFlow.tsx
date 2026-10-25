import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

interface ProcessStep {
  key: string;
  human?: boolean;
  /** 工程を実行する Claude Code スキル名。固有名のため翻訳しない */
  skill?: string;
  /** 工程の内訳。受け入れ試験の 2 段（自動テストの内容確認 → ユーザーテスト）など */
  subKeys?: readonly string[];
}

interface ProcessLoop {
  titleKey: string;
  scaleKey: string;
  /** ループを実行する Claude Code スキル名。固有名のため翻訳しない */
  skill?: string;
  /** ループを回す前提の注記。ループ A は自動テストの範囲を事前定義した上で回す */
  noteKey?: string;
  steps: readonly ProcessStep[];
  /** ループの出口注記（差し戻し・改訂の戻り先） */
  returnKey?: string;
  /** 直前のループから伸びる矢印のラベル。最初のループには無い */
  edgeKey?: string;
}

const LOOPS: readonly ProcessLoop[] = [
  {
    titleKey: 'loopATitle',
    scaleKey: 'loopAScale',
    skill: 'anytime-dev-cycle',
    noteKey: 'loopANote',
    steps: [
      { key: 'loopA1' },
      { key: 'loopA2', human: true },
      { key: 'loopA3' },
      { key: 'loopA4' },
      { key: 'loopA5' },
    ],
    returnKey: 'loopAReturn',
  },
  {
    titleKey: 'loopBTitle',
    scaleKey: 'loopBScale',
    steps: [
      { key: 'loopB1', human: true, subKeys: ['loopB1a', 'loopB1b'] },
      { key: 'loopB2', skill: 'production-release' },
    ],
    returnKey: 'loopBReturn',
    edgeKey: 'edgeAB',
  },
  {
    titleKey: 'loopCTitle',
    scaleKey: 'loopCScale',
    skill: 'anytime-dev-retro',
    steps: [{ key: 'loopC1' }, { key: 'loopC2', human: true }],
    returnKey: 'loopCReturn',
    edgeKey: 'edgeBC',
  },
] as const;

function SkillTag({ label, skill }: Readonly<{ label: string; skill: string }>) {
  return (
    <span className={styles.processSkill}>
      {label}
      <code>{skill}</code>
    </span>
  );
}

function FlowArrow({ label }: Readonly<{ label?: string }>) {
  return (
    <div className={styles.processArrow}>
      <span className={styles.processArrowGlyph} aria-hidden="true">
        ▼
      </span>
      {label ? <span className={styles.processArrowLabel}>{label}</span> : null}
    </div>
  );
}

export function ProcessFlow() {
  const t = useTranslations('press.process');
  return (
    <figure className={styles.processFlow} aria-label={t('figureLabel')}>
      <div className={`${styles.processNode} ${styles.processNodeHuman}`}>{t('input')}</div>
      {LOOPS.map((loop) => (
        <div key={loop.titleKey} className={styles.processLoopBlock}>
          <FlowArrow label={loop.edgeKey ? t(loop.edgeKey) : undefined} />
          <section className={styles.processLoop}>
            <header className={styles.processLoopHead}>
              <span className={styles.processLoopTitle}>{t(loop.titleKey)}</span>
              <span className={styles.processLoopScale}>{t(loop.scaleKey)}</span>
            </header>
            {loop.skill ? <SkillTag label={t('skillLabel')} skill={loop.skill} /> : null}
            {loop.noteKey ? <p className={styles.processNote}>{t(loop.noteKey)}</p> : null}
            <ol className={styles.processSteps}>
              {loop.steps.map((step, idx) => (
                <li
                  key={step.key}
                  className={step.human ? `${styles.processNode} ${styles.processNodeHuman}` : styles.processNode}
                >
                  {idx > 0 ? (
                    <span className={styles.processStepArrow} aria-hidden="true">
                      ▼
                    </span>
                  ) : null}
                  {t(step.key)}
                  {step.subKeys ? (
                    <ol className={styles.processSubSteps}>
                      {step.subKeys.map((subKey) => (
                        <li key={subKey}>{t(subKey)}</li>
                      ))}
                    </ol>
                  ) : null}
                  {step.skill ? <SkillTag label={t('skillLabel')} skill={step.skill} /> : null}
                </li>
              ))}
            </ol>
            {loop.returnKey ? (
              <p className={styles.processReturn}>
                <span className={styles.processReturnGlyph} aria-hidden="true">
                  ↺
                </span>
                {t(loop.returnKey)}
              </p>
            ) : null}
          </section>
        </div>
      ))}
      <figcaption className={styles.processCaption}>{t('caption')}</figcaption>
    </figure>
  );
}
