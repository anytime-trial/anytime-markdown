import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { TrailSessionCommit, TrailTokenUsage } from '../../../domain/parser/types';
import { fmtNum, fmtTokens } from '../../../domain/analytics/formatters';

export interface SessionCommitListProps {
  sessionId: string;
  usage: TrailTokenUsage;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
  colors: { border: string; textSecondary: string; midnightNavy: string };
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  t: (k: string) => string;
}

export function mountSessionCommitList(
  container: HTMLElement,
  props: SessionCommitListProps,
): VanillaViewHandle<SessionCommitListProps> {
  const root = document.createElement('div');
  root.style.cssText = [
    `background-color:${props.cardSx.bgcolor}`,
    `border:${props.cardSx.border}`,
    `border-radius:${props.cardSx.borderRadius}`,
    'margin-top:8px',
    'padding:12px',
  ].join(';');
  container.appendChild(root);

  let currentProps = props;
  let cancelled = false;

  function renderLoading(p: SessionCommitListProps): void {
    root.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
    msg.textContent = p.t('analytics.loadingCommits');
    root.appendChild(msg);
  }

  function renderEmpty(p: SessionCommitListProps): void {
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:8px;font-size:0.875rem;font-weight:600;';
    header.textContent = `${p.t('analytics.relatedCommits')} (0)`;
    root.appendChild(header);

    const emptyBox = document.createElement('div');
    emptyBox.style.cssText = [
      'height:198px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `border:1px dashed ${p.colors.border}`,
      'border-radius:4px',
    ].join(';');
    const emptyMsg = document.createElement('span');
    emptyMsg.style.cssText = `color:${p.colors.textSecondary};font-size:0.875rem;`;
    emptyMsg.textContent = p.t('analytics.noCommits');
    emptyBox.appendChild(emptyMsg);
    root.appendChild(emptyBox);
  }

  function renderCommits(
    p: SessionCommitListProps,
    commits: readonly TrailSessionCommit[],
  ): void {
    root.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:8px;';
    const headerText = document.createElement('span');
    headerText.style.cssText = 'font-size:0.875rem;font-weight:600;';
    headerText.textContent = `${p.t('analytics.relatedCommits')} (${commits.length})`;
    header.appendChild(headerText);
    root.appendChild(header);

    if (commits.length === 0) {
      renderEmpty(p);
      return;
    }

    // Scrollable table wrapper
    const tableWrapper = document.createElement('div');
    tableWrapper.style.cssText = 'height:198px;overflow-y:auto;';
    root.appendChild(tableWrapper);

    const table = document.createElement('table');
    table.style.cssText =
      'width:100%;border-collapse:collapse;font-size:0.8rem;';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headerCells = [
      p.t('analytics.commitHash'),
      p.t('analytics.commitRepo'),
      p.t('analytics.commitMessage'),
      p.t('analytics.commitFiles'),
      p.t('analytics.commitDiff'),
    ];
    for (let i = 0; i < headerCells.length; i++) {
      const th = document.createElement('th');
      th.textContent = headerCells[i] ?? '';
      th.style.cssText = [
        `color:${p.colors.textSecondary}`,
        `border-bottom:1px solid ${p.colors.border}`,
        `background-color:${p.colors.midnightNavy}`,
        'padding:4px 8px',
        'text-align:left',
        'position:sticky',
        'top:0',
        i >= 3 ? 'text-align:right' : '',
      ]
        .filter(Boolean)
        .join(';');
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (const c of commits) {
      const tr = document.createElement('tr');

      // Hash cell
      const hashTd = document.createElement('td');
      hashTd.style.cssText = `padding:4px 8px;border-bottom:1px solid ${p.colors.border};font-family:monospace;`;
      hashTd.textContent = c.commitHash.slice(0, 8);
      if (c.isAiAssisted) {
        const aiLabel = document.createElement('span');
        aiLabel.style.cssText =
          'margin-left:4px;color:var(--am-color-info-main);font-size:0.75rem;';
        aiLabel.textContent = p.t('analytics.commitAI');
        hashTd.appendChild(aiLabel);
      }
      tr.appendChild(hashTd);

      // Repo cell
      const isLegacy = c.repoName === '';
      const repoLabel = isLegacy ? p.t('analytics.commitRepoLegacy') : c.repoName;
      const repoTd = document.createElement('td');
      repoTd.style.cssText = [
        `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
        'font-family:monospace',
        'font-size:0.75rem',
        'white-space:nowrap',
        isLegacy ? `color:${p.colors.textSecondary}` : '',
      ]
        .filter(Boolean)
        .join(';');
      repoTd.textContent = repoLabel;
      tr.appendChild(repoTd);

      // Message cell
      const msgTd = document.createElement('td');
      msgTd.style.cssText = [
        `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
        'max-width:300px',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
      ].join(';');
      msgTd.textContent = c.commitMessage;
      tr.appendChild(msgTd);

      // Files cell
      const filesTd = document.createElement('td');
      filesTd.style.cssText = `padding:4px 8px;border-bottom:1px solid ${p.colors.border};text-align:right;`;
      filesTd.textContent = String(c.filesChanged);
      tr.appendChild(filesTd);

      // Diff cell
      const diffTd = document.createElement('td');
      diffTd.style.cssText = [
        `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
        'text-align:right',
        'font-family:monospace',
        'white-space:nowrap',
      ].join(';');
      diffTd.textContent = `+${fmtNum(c.linesAdded)} / -${fmtNum(c.linesDeleted)}`;
      tr.appendChild(diffTd);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrapper.appendChild(table);

    // Footer: tokens per line
    const totalAdded = commits.reduce((sum, c) => sum + c.linesAdded, 0);
    if (totalAdded > 0) {
      const totalTokens =
        p.usage.inputTokens +
        p.usage.outputTokens +
        p.usage.cacheReadTokens +
        p.usage.cacheCreationTokens;
      const tokensPerLine = Math.round(totalTokens / totalAdded);
      const footer = document.createElement('div');
      footer.style.cssText =
        'margin-top:8px;font-size:0.75rem;color:var(--am-color-text-secondary);display:block;';
      footer.textContent = `${p.t('analytics.tokensPerLineLabel')} ${fmtTokens(tokensPerLine)}`;
      root.appendChild(footer);
    }
  }

  function fetch(p: SessionCommitListProps): void {
    cancelled = false;
    renderLoading(p);

    void (async () => {
      try {
        const result = await p.fetchSessionCommits(p.sessionId);
        if (!cancelled) renderCommits(p, result);
      } catch {
        if (!cancelled) renderCommits(p, []);
      }
    })();
  }

  fetch(props);

  return {
    update(newProps: SessionCommitListProps) {
      cancelled = true;
      currentProps = newProps;
      fetch(newProps);
    },
    destroy() {
      cancelled = true;
      void currentProps;
      root.remove();
    },
  };
}
