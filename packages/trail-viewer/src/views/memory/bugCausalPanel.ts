/**
 * BugCausal サイドパネルの vanilla 版（`components/memory/BugCausalPanel.tsx` の素 DOM 等価）。
 *
 * 選択バグの因果情報（同一原因バグ・事前指摘・混入コミット・影響ファイル・根本原因）を表示する。
 * data 取得はホスト（bugHistoryPanel.ts）が行い、loading/info を props として受け取る。
 */
import {
  createChip,
  createDivider,
  createText,
  createTooltip,
  OpenInNew,
} from '@anytime-markdown/ui-core';
import type { MemoryBugCausalInfo } from '../../data/types';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

// MUI Chip color → CSS 変数マッピング
const CATEGORY_COLOR_VAR: Record<string, string> = {
  regression: 'var(--am-color-error-main)',
  spec: 'var(--am-color-info-main)',
  logic: 'var(--am-color-warning-main)',
  typo: 'var(--am-color-text-secondary)',
  deps: 'var(--am-color-text-secondary)',
};

const SEVERITY_COLOR_VAR: Record<string, string> = {
  info: 'var(--am-color-info-main)',
  warn: 'var(--am-color-warning-main)',
  error: 'var(--am-color-error-main)',
};

export interface BugCausalPanelProps {
  t: (key: string) => string;
  reader: MemoryReader | null;
  bugEntityId: string | null;
  onOpenPrecedingReviews?: (findingIds: readonly string[]) => void;
  onOpenSiblingBugs?: (bugEntityIds: readonly string[]) => void;
}

/** セクションブロック（タイトル + 子 + 区切り線）を生成する。 */
function makeSection(title: string): { wrap: HTMLDivElement; body: HTMLDivElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:10px;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText =
    'font-size:0.7rem;font-weight:600;color:var(--am-color-text-secondary);margin-bottom:4px;';
  titleEl.textContent = title;

  const body = document.createElement('div');

  const { el: divEl } = createDivider();
  divEl.style.marginTop = '8px';

  wrap.append(titleEl, body, divEl);
  return { wrap, body };
}

/** chip を色付きボーダー（outlined 風）で装飾するヘルパー。 */
function styledChip(label: string, colorVar: string, onClick?: () => void): HTMLElement {
  const { el } = createChip({
    label,
    size: 'small',
    onClick,
  });
  el.style.outline = `1px solid ${colorVar}`;
  el.style.color = colorVar;
  return el;
}

export function mountBugCausalPanel(
  container: HTMLElement,
  initial: BugCausalPanelProps,
): VanillaViewHandle<BugCausalPanelProps> {
  let props = initial;
  let cancelCurrent: (() => void) | null = null;

  const root = document.createElement('div');
  root.setAttribute('aria-label', 'bug-causal');
  root.style.cssText = 'height:100%;overflow:auto;padding:12px;box-sizing:border-box;';
  container.appendChild(root);

  // --- 状態 ---
  type State = { kind: 'empty' } | { kind: 'loading' } | { kind: 'data'; info: MemoryBugCausalInfo };
  let state: State = { kind: 'empty' };

  function renderContent(): void {
    root.replaceChildren();

    if (state.kind === 'empty') {
      const msg = document.createElement('div');
      msg.style.cssText =
        'height:100%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--am-color-text-secondary);';
      msg.textContent = props.t('memory.bug.causedBy.empty');
      root.appendChild(msg);
      return;
    }

    if (state.kind === 'loading') {
      const msg = document.createElement('div');
      msg.style.cssText =
        'height:100%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--am-color-text-secondary);';
      msg.textContent = props.t('memory.loading');
      root.appendChild(msg);
      return;
    }

    const { info } = state;

    // このバグ
    {
      const { wrap, body } = makeSection(`📌 ${props.t('memory.bug.causal.thisBug')}`);
      const subject = document.createElement('div');
      subject.style.cssText =
        'font-size:0.8rem;font-weight:500;color:var(--am-color-text-primary);margin-bottom:4px;';
      subject.textContent = info.subject;

      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;';

      const catColorVar = CATEGORY_COLOR_VAR[info.category] ?? 'var(--am-color-text-secondary)';
      meta.appendChild(styledChip(info.category, catColorVar));

      const sha = document.createElement('span');
      sha.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);font-family:monospace;';
      sha.textContent = info.commitSha.slice(0, 7);

      const date = document.createElement('span');
      date.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      date.textContent = `(${info.committedAt.slice(0, 10)})`;

      meta.append(sha, date);
      body.append(subject, meta);
      root.appendChild(wrap);
    }

    // 同じ原因の過去バグ
    if (info.siblingBugEntityIds.length > 0) {
      const { wrap, body } = makeSection(`🔁 ${props.t('memory.bug.causal.sibling')}`);
      const chipEl = styledChip(
        `${info.siblingBugEntityIds.length} ${props.t('memory.bug.causal.bugsUnit')}`,
        'var(--am-color-warning-main)',
        props.onOpenSiblingBugs ? () => props.onOpenSiblingBugs!(info.siblingBugEntityIds) : undefined,
      );
      createTooltip({ reference: chipEl as HTMLElement, title: props.t('memory.bug.causal.sibling.tooltip') });
      body.appendChild(chipEl);
      root.appendChild(wrap);
    }

    // 事前指摘
    if (info.precedingFindings.length > 0) {
      const { wrap, body } = makeSection(`⚠ ${props.t('memory.bug.causal.preceding')}`);
      const chipEl = styledChip(
        `${info.precedingFindings.length} ${props.t('memory.bug.causal.findingsUnit')}`,
        'var(--am-color-info-main)',
        props.onOpenPrecedingReviews
          ? () => props.onOpenPrecedingReviews!(info.precedingFindings.map((f) => f.findingEntityId))
          : undefined,
      );
      body.appendChild(chipEl);

      const ul = document.createElement('ul');
      ul.style.cssText = 'margin:4px 0 0 0;padding-left:16px;';
      for (const f of info.precedingFindings.slice(0, 5)) {
        const li = document.createElement('li');
        li.style.cssText =
          'font-size:0.7rem;color:var(--am-color-text-secondary);margin-bottom:2px;list-style:disc;display:list-item;';
        const sevColorVar = SEVERITY_COLOR_VAR[f.severity] ?? 'var(--am-color-text-secondary)';
        const sevChip = styledChip(f.severity, sevColorVar);
        sevChip.style.marginRight = '4px';
        sevChip.style.verticalAlign = 'middle';

        const fileSpan = document.createElement('span');
        fileSpan.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-primary);';
        fileSpan.textContent = f.targetFilePath ?? '—';

        li.append(sevChip, fileSpan);
        ul.appendChild(li);
      }
      body.appendChild(ul);
      root.appendChild(wrap);
    }

    // 混入コミット
    if (info.introducedByCommitSha) {
      const { wrap, body } = makeSection(`🔧 ${props.t('memory.bug.causal.introducedBy')}`);
      const shaEl = document.createElement('div');
      shaEl.style.cssText =
        'font-size:0.75rem;color:var(--am-color-text-secondary);font-family:monospace;';
      shaEl.textContent = info.introducedByCommitSha.slice(0, 7);
      body.appendChild(shaEl);
      if (info.introducedByCommitSubject) {
        const subj = document.createElement('div');
        subj.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-primary);margin-top:2px;';
        subj.textContent = info.introducedByCommitSubject;
        body.appendChild(subj);
      }
      root.appendChild(wrap);
    }

    // 影響ファイル
    if (info.affectedFilePaths.length > 0) {
      const { wrap, body } = makeSection(
        `📁 ${props.t('memory.bug.causal.affectedFiles')} (${info.affectedFilePaths.length})`,
      );
      const ul = document.createElement('ul');
      ul.style.cssText = 'margin:0;padding-left:16px;';
      for (const p of info.affectedFilePaths.slice(0, 6)) {
        const li = document.createElement('li');
        li.style.cssText =
          'font-size:0.7rem;color:var(--am-color-text-secondary);font-family:monospace;list-style:disc;display:list-item;';
        li.textContent = p;
        ul.appendChild(li);
      }
      if (info.affectedFilePaths.length > 6) {
        const more = document.createElement('li');
        more.style.cssText =
          'font-size:0.65rem;color:var(--am-color-text-disabled);list-style:none;';
        more.textContent = `…+ ${info.affectedFilePaths.length - 6}`;
        ul.appendChild(more);
      }
      body.appendChild(ul);
      root.appendChild(wrap);
    }

    // 根本原因
    if (info.rootCauses.length > 0) {
      const { wrap, body } = makeSection(`🧩 ${props.t('memory.bug.causal.rootCauses')}`);
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
      for (const rc of info.rootCauses) {
        const span = document.createElement('div');
        span.style.cssText = 'font-size:0.7rem;color:var(--am-color-text-primary);';
        span.textContent = `• ${rc.displayName}`;
        col.appendChild(span);
      }
      body.appendChild(col);
      root.appendChild(wrap);
    }

    // すべて空
    if (
      info.siblingBugEntityIds.length === 0 &&
      info.precedingFindings.length === 0 &&
      !info.introducedByCommitSha &&
      info.affectedFilePaths.length === 0 &&
      info.rootCauses.length === 0
    ) {
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);font-style:italic;';
      msg.textContent = props.t('memory.bug.causal.noCauses');
      root.appendChild(msg);
    }
  }

  function loadCausal(): void {
    cancelCurrent?.();
    cancelCurrent = null;

    if (!props.reader || !props.bugEntityId) {
      state = { kind: 'empty' };
      renderContent();
      return;
    }

    state = { kind: 'loading' };
    renderContent();

    let cancelled = false;
    cancelCurrent = () => { cancelled = true; };

    void props.reader.getBugCausalInfo(props.bugEntityId).then((info) => {
      if (cancelled) return;
      cancelCurrent = null;
      state = info ? { kind: 'data', info } : { kind: 'empty' };
      renderContent();
    });
  }

  loadCausal();

  return {
    update(next) {
      const bugEntityIdChanged = next.bugEntityId !== props.bugEntityId;
      const readerChanged = next.reader !== props.reader;
      props = next;
      if (bugEntityIdChanged || readerChanged) {
        loadCausal();
      } else {
        renderContent();
      }
    },
    destroy() {
      cancelCurrent?.();
      root.remove();
    },
  };
}
