/**
 * DeadCodeDetailSection の vanilla DOM 等価実装。
 * entries が空の場合は何も描画しない（React 版の `if (entries.length === 0) return null` に対応）。
 */
import type { FileAnalysisApiEntry } from '../../../c4/hooks/fetchFileAnalysisApi';
import { aggregateDeadCodeForElement, type DeadCodeJudgment } from '../../../c4/components/deadCodeJudgment';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

interface Colors {
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
}

export interface DeadCodeDetailPanelProps {
  readonly entries: readonly FileAnalysisApiEntry[];
  readonly t: (key: string) => string;
  readonly colors: Colors;
  readonly onFileOpen?: (filePath: string) => void;
}

const JUDGMENT_COLOR: Record<DeadCodeJudgment, string> = {
  strong: '#f44336',
  review: '#ffc107',
  healthy: '#4caf50',
  ignored: '#9e9e9e',
};

const JUDGMENT_I18N_KEY: Record<DeadCodeJudgment, string> = {
  strong: 'c4.popup.deadCode.judgmentStrong',
  review: 'c4.popup.deadCode.judgmentReview',
  healthy: 'c4.popup.deadCode.judgmentHealthy',
  ignored: 'c4.popup.deadCode.judgmentIgnored',
};

const SIGNAL_DEFS = [
  { key: 'orphan' as const, weight: 45, i18n: 'c4.popup.deadCode.signalOrphan' },
  { key: 'fanInZero' as const, weight: 25, i18n: 'c4.popup.deadCode.signalFanInZero' },
  { key: 'noRecentChurn' as const, weight: 15, i18n: 'c4.popup.deadCode.signalNoRecentChurn' },
  { key: 'zeroCoverage' as const, weight: 10, i18n: 'c4.popup.deadCode.signalZeroCoverage' },
  { key: 'isolatedCommunity' as const, weight: 5, i18n: 'c4.popup.deadCode.signalIsolatedCommunity' },
];

function makeSvgIcon(path: string, color: string, size = 11): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.cssText = `width:${size}px;height:${size}px;fill:${color};flex-shrink:0;`;
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

const CHECK_PATH = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const CLOSE_PATH = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

export function mountDeadCodeDetailPanel(
  container: HTMLElement,
  initial: DeadCodeDetailPanelProps,
): VanillaViewHandle<DeadCodeDetailPanelProps> {
  let props = initial;

  const root = document.createElement('div');
  container.appendChild(root);

  function render(): void {
    root.replaceChildren();
    if (props.entries.length === 0) return;

    const agg = aggregateDeadCodeForElement(props.entries);
    const judgmentLabel = props.t(JUDGMENT_I18N_KEY[agg.judgment]);
    const judgmentColor = JUDGMENT_COLOR[agg.judgment];
    const c = props.colors;

    root.style.cssText = `border-top:1px solid ${c.border};margin-top:10px;padding-top:8px;`;

    // Title
    const title = document.createElement('span');
    title.style.cssText = `display:block;color:${c.textSecondary};font-size:0.68rem;font-weight:700;margin-bottom:4px;`;
    title.textContent = props.t('c4.popup.deadCode.title');
    root.appendChild(title);

    // Score + judgment badge
    const scoreRow = document.createElement('div');
    scoreRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:6px;';
    const scoreEl = document.createElement('span');
    scoreEl.style.cssText = `color:${c.text};font-size:0.78rem;font-weight:700;`;
    scoreEl.textContent = `${agg.score} / 100`;
    const badgeEl = document.createElement('span');
    badgeEl.style.cssText = `color:${judgmentColor};font-size:0.65rem;font-weight:700;`;
    badgeEl.textContent = `[${judgmentLabel}]`;
    scoreRow.append(scoreEl, badgeEl);
    root.appendChild(scoreRow);

    // Signal checklist
    const signalGrid = document.createElement('div');
    signalGrid.style.cssText = 'display:grid;gap:2px;margin-bottom:6px;';
    for (const sig of SIGNAL_DEFS) {
      const active = agg.signals[sig.key];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;';
      const icon = active
        ? makeSvgIcon(CHECK_PATH, '#f44336', 11)
        : makeSvgIcon(CLOSE_PATH, c.textMuted, 11);
      const label = document.createElement('span');
      label.style.cssText = `color:${active ? c.text : c.textMuted};font-size:0.6rem;flex:1;`;
      label.textContent = props.t(sig.i18n);
      const weight = document.createElement('span');
      weight.style.cssText = `color:${c.textMuted};font-size:0.58rem;`;
      weight.textContent = `+${sig.weight}`;
      row.append(icon, label, weight);
      signalGrid.appendChild(row);
    }
    root.appendChild(signalGrid);

    // Phase 6 S5-D: 最近動き始めたコードのバッジ。dead code スコアには加算しないため
    // シグナル一覧とは分けて表示する（用途はドキュメント整備の優先度提示）。
    const newlyActiveCount = props.entries.filter((e) => e.newlyActive === true).length;
    if (newlyActiveCount > 0) {
      const badge = document.createElement('div');
      badge.style.cssText = `display:flex;align-items:center;gap:4px;margin-bottom:6px;color:${c.text};font-size:0.6rem;`;
      const dot = document.createElement('span');
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#42a5f5;flex:0 0 auto;';
      const text = document.createElement('span');
      text.textContent = `${props.t('c4.popup.newlyActive')} (${newlyActiveCount})`;
      badge.append(dot, text);
      badge.title = props.t('c4.popup.newlyActive.description');
      root.appendChild(badge);
    }

    // Related files
    if (agg.relatedFiles.length > 0) {
      const filesSection = document.createElement('div');
      const filesTitle = document.createElement('span');
      filesTitle.style.cssText = `display:block;color:${c.textSecondary};font-size:0.62rem;font-weight:600;margin-bottom:2px;`;
      filesTitle.textContent = props.t('c4.popup.deadCode.relatedFiles');
      filesSection.appendChild(filesTitle);
      for (const f of agg.relatedFiles) {
        const fileRow = document.createElement('div');
        fileRow.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:1px 0;cursor:${props.onFileOpen ? 'pointer' : 'default'};`;
        if (props.onFileOpen) {
          const onFileOpen = props.onFileOpen;
          const filePath = f.filePath;
          fileRow.addEventListener('click', () => onFileOpen(filePath));
          fileRow.addEventListener('mouseenter', () => { fileRow.style.textDecoration = 'underline'; });
          fileRow.addEventListener('mouseleave', () => { fileRow.style.textDecoration = 'none'; });
        }
        const pathEl = document.createElement('span');
        pathEl.style.cssText = `color:${c.text};font-size:0.6rem;word-break:break-all;`;
        pathEl.textContent = f.filePath;
        const scoreFileEl = document.createElement('span');
        scoreFileEl.style.cssText = `color:${c.textMuted};font-size:0.58rem;margin-left:4px;`;
        scoreFileEl.textContent = `[${f.score}]`;
        fileRow.append(pathEl, scoreFileEl);
        filesSection.appendChild(fileRow);
      }
      root.appendChild(filesSection);
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
