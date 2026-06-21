/**
 * EvaluationPanel vanilla view.
 *
 * Renders a session-evaluation form (Rating + TextField inputs + save button)
 * plus the list of existing evaluations for the selected session.
 * Mirrors `components/EvaluationPanel.tsx` without any React/MUI dependency.
 */
import { createButton, createRating, createTextField } from '@anytime-markdown/ui-core';
import type { TrailEvaluation } from '../domain/parser/types';
import type { VanillaViewHandle } from '../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EvaluationPanelProps {
  readonly evaluations: readonly TrailEvaluation[];
  readonly selectedSessionId?: string;
  readonly onSave: (evaluation: TrailEvaluation) => void;
  readonly t: (key: string) => string;
  /** Design token colors — pass only what we need */
  readonly colors: Readonly<{
    textSecondary: string;
    border: string;
    amberGold: string;
    amberGoldHover: string;
    textOnLight: string;
  }>;
  readonly radius: Readonly<{ md: string }>;
}

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-builders
// ---------------------------------------------------------------------------

interface FormHandles {
  destroy(): void;
}

function buildEvaluationForm(
  parent: HTMLElement,
  props: EvaluationPanelProps,
  selectedSessionId: string,
): FormHandles {
  const handles: Array<{ destroy(): void }> = [];

  const wrap = document.createElement('div');
  wrap.style.marginBottom = '16px';

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:0.875rem;font-weight:600;margin-bottom:8px;';
  subtitle.textContent = props.t('eval.newEvaluation');
  wrap.appendChild(subtitle);

  // Score row
  let score: number | null = null;
  const scoreRow = document.createElement('div');
  scoreRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  const scoreLabel = document.createElement('span');
  scoreLabel.style.cssText = `font-size:0.8125rem;color:${props.colors.textSecondary};`;
  scoreLabel.textContent = props.t('eval.score');

  const ratingHandle = createRating({
    value: null,
    max: 5,
    onClick: (v) => {
      score = v;
      checkCanSubmit();
    },
  });
  handles.push(ratingHandle);
  scoreRow.append(scoreLabel, ratingHandle.el);
  wrap.appendChild(scoreRow);

  // Evaluator field
  let evaluator = '';
  const evaluatorHandle = createTextField({
    label: props.t('eval.evaluator'),
    value: '',
    size: 'small',
    fullWidth: true,
    onChange: (e) => {
      evaluator = (e.target as HTMLInputElement).value;
      checkCanSubmit();
    },
  });
  handles.push(evaluatorHandle);
  evaluatorHandle.el.style.marginBottom = '8px';
  wrap.appendChild(evaluatorHandle.el);

  // Comment field
  let comment = '';
  const commentHandle = createTextField({
    label: props.t('eval.comment'),
    value: '',
    multiline: true,
    minRows: 2,
    maxRows: 4,
    size: 'small',
    fullWidth: true,
    onChange: (e) => {
      comment = (e.target as HTMLTextAreaElement).value;
    },
  });
  handles.push(commentHandle);
  commentHandle.el.style.marginBottom = '8px';
  wrap.appendChild(commentHandle.el);

  // Save button
  const { el: saveBtn, update: updateBtn } = createButton({
    label: props.t('eval.save'),
    variant: 'contained',
    size: 'small',
    disabled: true,
    onClick: () => {
      if (score === null || !evaluator.trim()) return;
      const evaluation: TrailEvaluation = {
        id: `eval-${selectedSessionId}-${Date.now()}`,
        sessionId: selectedSessionId,
        score,
        comment: comment.trim(),
        evaluator: evaluator.trim(),
        createdAt: new Date().toISOString(),
      };
      props.onSave(evaluation);
      // Reset
      score = null;
      comment = '';
      evaluator = '';
      ratingHandle.setValue(null);
      evaluatorHandle.update({ value: '' });
      commentHandle.update({ value: '' });
      updateBtn({ disabled: true });
    },
  });
  saveBtn.style.cssText = `background-color:${props.colors.amberGold};color:${props.colors.textOnLight};border-radius:${props.radius.md};`;
  wrap.appendChild(saveBtn);

  parent.appendChild(wrap);

  function checkCanSubmit(): void {
    const can = score !== null && evaluator.trim().length > 0;
    updateBtn({ disabled: !can });
  }

  return {
    destroy() {
      for (const h of handles) h.destroy();
    },
  };
}

function buildEvaluationItem(
  parent: HTMLElement,
  evaluation: TrailEvaluation,
  props: EvaluationPanelProps,
): { destroy(): void } {
  const handles: Array<{ destroy(): void }> = [];

  const item = document.createElement('div');
  item.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--am-color-divider);';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';

  const ratingHandle = createRating({
    value: evaluation.score,
    max: 5,
    readOnly: true,
    size: 'small',
  });
  handles.push(ratingHandle);

  const evaluatorEl = document.createElement('span');
  evaluatorEl.style.cssText = `margin-left:auto;color:${props.colors.textSecondary};font-size:0.8125rem;`;
  evaluatorEl.textContent = evaluation.evaluator;

  const dateEl = document.createElement('span');
  dateEl.style.cssText = `color:${props.colors.textSecondary};font-size:0.75rem;`;
  dateEl.textContent = formatDate(evaluation.createdAt);

  row.append(ratingHandle.el, evaluatorEl, dateEl);
  item.appendChild(row);

  if (evaluation.comment) {
    const commentEl = document.createElement('div');
    commentEl.style.cssText = 'font-size:0.8125rem;margin-top:4px;';
    commentEl.textContent = evaluation.comment;
    item.appendChild(commentEl);
  }

  parent.appendChild(item);
  return {
    destroy() {
      for (const h of handles) h.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

export function mountEvaluationPanel(
  container: HTMLElement,
  initial: EvaluationPanelProps,
): VanillaViewHandle<EvaluationPanelProps> {
  let props = initial;
  const itemHandles: Array<{ destroy(): void }> = [];
  let formHandle: FormHandles | null = null;

  // Root card
  const root = document.createElement('div');
  root.style.cssText =
    `background-color:var(--am-color-bg-paper);` +
    `border:1px solid var(--am-color-divider);border-radius:12px;padding:16px;`;
  container.appendChild(root);

  // Title
  const title = document.createElement('div');
  title.style.cssText = 'font-size:1.25rem;font-weight:600;margin-bottom:16px;';
  root.appendChild(title);

  // Content area
  const content = document.createElement('div');
  root.appendChild(content);

  function renderContent(): void {
    // Destroy previous
    for (const h of itemHandles) h.destroy();
    itemHandles.length = 0;
    formHandle?.destroy();
    formHandle = null;
    content.replaceChildren();

    title.textContent = props.t('eval.title');

    if (!props.selectedSessionId) {
      const msg = document.createElement('div');
      msg.style.cssText = `font-size:0.8125rem;color:${props.colors.textSecondary};`;
      msg.textContent = props.t('eval.selectSession');
      content.appendChild(msg);
      return;
    }

    const selectedSessionId = props.selectedSessionId;

    // Form
    formHandle = buildEvaluationForm(content, props, selectedSessionId);

    // Divider
    const divider = document.createElement('hr');
    divider.style.cssText = `border:none;border-top:1px solid ${props.colors.border};margin:8px 0;`;
    content.appendChild(divider);

    // Existing evaluations
    const sessionEvaluations = props.evaluations.filter((e) => e.sessionId === selectedSessionId);
    if (sessionEvaluations.length === 0) {
      const noEval = document.createElement('div');
      noEval.style.cssText = `font-size:0.8125rem;color:${props.colors.textSecondary};`;
      noEval.textContent = props.t('eval.noEvaluations');
      content.appendChild(noEval);
    } else {
      const list = document.createElement('div');
      for (const evalItem of sessionEvaluations) {
        const h = buildEvaluationItem(list, evalItem, props);
        itemHandles.push(h);
      }
      content.appendChild(list);
    }
  }

  renderContent();

  return {
    update(next) {
      props = next;
      renderContent();
    },
    destroy() {
      for (const h of itemHandles) h.destroy();
      formHandle?.destroy();
      root.remove();
    },
  };
}
