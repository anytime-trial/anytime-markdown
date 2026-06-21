/**
 * DriftDetailDialog の vanilla 版（`components/memory/DriftDetailDialog.tsx` の素 DOM 等価）。
 *
 * イベント詳細を Dialog でロード・表示し、未解決なら resolve アクションを提供する。
 * useEffect/useState 等の hooks は mountDriftDetailDialog の内部変数に置き換える。
 */
import {
  createButton,
  createChip,
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogTitle,
  createSpinner,
  createTextField,
} from '@anytime-markdown/ui-core';
import type { MemoryDriftEventDetail } from '../../data/types';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

// MUI Chip color → CSS 変数マッピング（severity）
const SEVERITY_COLOR_VAR: Record<string, string> = {
  info: 'var(--am-color-info-main)',
  warn: 'var(--am-color-warning-main)',
  error: 'var(--am-color-error-main)',
};

export interface DriftDetailDialogProps {
  readonly t: (key: string) => string;
  readonly eventId: string;
  readonly onClose: () => void;
  readonly onResolve: (id: string, note: string) => Promise<void>;
  readonly onLoadDetail: (id: string) => Promise<unknown>;
}

function makeDetailRow(label: string, valueNode: string | HTMLElement): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;';

  const labelEl = document.createElement('span');
  labelEl.style.cssText =
    'font-size:0.75rem;color:var(--am-color-text-secondary);min-width:120px;flex-shrink:0;';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-primary);word-break:break-all;';
  if (typeof valueNode === 'string') {
    valueEl.textContent = valueNode;
  } else {
    valueEl.appendChild(valueNode);
  }

  row.append(labelEl, valueEl);
  return row;
}

function severityChip(severity: string): HTMLElement {
  const { el } = createChip({ label: severity, size: 'small' });
  const colorVar = SEVERITY_COLOR_VAR[severity];
  if (colorVar) {
    el.style.outline = `1px solid ${colorVar}`;
    el.style.color = colorVar;
  }
  return el;
}

export function mountDriftDetailDialog(
  _container: HTMLElement,
  initial: DriftDetailDialogProps,
): VanillaViewHandle<DriftDetailDialogProps> {
  let props = initial;
  let detail: MemoryDriftEventDetail | null = null;
  let loading = true;
  let note = '';
  let resolving = false;

  // --- Dialog scaffold ---
  const titleEl = createDialogTitle({ children: props.t('memory.drift.detail') });
  const contentEl = createDialogContent();
  const actionsEl = createDialogActions();

  // Build spinner (shown while loading)
  const spinnerWrap = document.createElement('div');
  spinnerWrap.style.cssText = 'display:flex;justify-content:center;padding:24px 0;';
  const spinner = createSpinner({ size: 24 });
  spinnerWrap.appendChild(spinner.el);

  // Detail body container (shown when loaded)
  const detailBody = document.createElement('div');

  // Note field (shown when unresolved)
  const noteField = createTextField({
    fullWidth: true,
    size: 'small',
    label: props.t('memory.drift.resolutionNote'),
    value: note,
    multiline: true,
    minRows: 2,
    onChange: (e) => {
      note = (e.target as HTMLInputElement).value;
    },
  });
  noteField.el.style.marginTop = '12px';

  // Resolved box (shown when resolved)
  const resolvedBox = document.createElement('div');
  resolvedBox.style.cssText =
    'margin-top:12px;padding:8px;border-radius:4px;border:1px solid var(--am-color-divider);';

  // Close / Cancel button
  const closeBtn = createButton({
    size: 'small',
    label: props.t('memory.drift.detail'),
    onClick: () => props.onClose(),
  });
  closeBtn.el.style.fontSize = '0.75rem';

  // Resolve button
  const resolveBtn = createButton({
    size: 'small',
    variant: 'contained',
    label: props.t('memory.drift.resolve'),
    onClick: () => void handleResolve(),
  });
  resolveBtn.el.style.cssText += ';font-size:0.75rem;background-color:var(--am-color-primary-main);';

  actionsEl.el.append(closeBtn.el, resolveBtn.el);

  const dialog = createDialog({
    maxWidth: 'sm',
    fullWidth: true,
    onClose: () => props.onClose(),
    children: [titleEl.el, contentEl.el, actionsEl.el],
  });

  async function handleResolve(): Promise<void> {
    if (resolving) return;
    resolving = true;
    renderActions();
    try {
      await props.onResolve(props.eventId, note);
      props.onClose();
    } finally {
      resolving = false;
      renderActions();
    }
  }

  function renderTitle(): void {
    titleEl.el.textContent = detail
      ? (detail.subjectDisplayName || detail.subjectEntityId)
      : props.t('memory.drift.detail');
  }

  function renderContent(): void {
    contentEl.el.replaceChildren();
    if (loading) {
      contentEl.el.appendChild(spinnerWrap);
      return;
    }
    if (detail == null) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
      empty.textContent = '—';
      contentEl.el.appendChild(empty);
      return;
    }
    detailBody.replaceChildren();
    detailBody.appendChild(makeDetailRow('Type', detail.driftType));
    detailBody.appendChild(makeDetailRow('Predicate', detail.predicate));
    detailBody.appendChild(makeDetailRow(props.t('memory.drift.filterSeverity'), severityChip(detail.severity)));
    detailBody.appendChild(makeDetailRow('Detected', detail.detectedAt.slice(0, 10)));
    if (detail.conversationValue != null) {
      detailBody.appendChild(makeDetailRow('Conversation', detail.conversationValue));
    }
    if (detail.specValue != null) {
      detailBody.appendChild(makeDetailRow('Spec', detail.specValue));
    }
    if (detail.codeValue != null) {
      detailBody.appendChild(makeDetailRow('Code', detail.codeValue));
    }
    if (detail.detailJson != null) {
      const jsonBlock = document.createElement('div');
      jsonBlock.style.cssText = 'margin-top:8px;';
      const jsonLabel = document.createElement('span');
      jsonLabel.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      jsonLabel.textContent = 'Detail JSON';
      const pre = document.createElement('pre');
      pre.style.cssText =
        'margin:4px 0 0;padding:8px;border-radius:4px;background:var(--am-color-divider);' +
        'font-size:0.65rem;color:var(--am-color-text-primary);overflow:auto;' +
        'max-height:180px;white-space:pre-wrap;word-break:break-all;';
      pre.textContent = JSON.stringify(detail.detailJson, null, 2);
      jsonBlock.append(jsonLabel, pre);
      detailBody.appendChild(jsonBlock);
    }

    if (detail.resolvedAt != null) {
      resolvedBox.replaceChildren();
      const resolvedText = document.createElement('span');
      resolvedText.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      resolvedText.textContent = `${props.t('memory.drift.resolved')} — ${detail.resolvedAt.slice(0, 10)}`;
      resolvedBox.appendChild(resolvedText);
      if (detail.resolutionNote) {
        const noteText = document.createElement('span');
        noteText.style.cssText =
          'display:block;font-size:0.75rem;color:var(--am-color-text-primary);margin-top:4px;';
        noteText.textContent = detail.resolutionNote;
        resolvedBox.appendChild(noteText);
      }
      detailBody.appendChild(resolvedBox);
    } else {
      noteField.update({ value: note, label: props.t('memory.drift.resolutionNote') });
      detailBody.appendChild(noteField.el);
    }

    contentEl.el.appendChild(detailBody);
  }

  function renderActions(): void {
    const isResolved = detail?.resolvedAt != null;
    closeBtn.update({ label: isResolved ? 'Close' : 'Cancel' });

    const showResolveBtn = !loading && !isResolved && detail != null;
    resolveBtn.el.style.display = showResolveBtn ? '' : 'none';
    if (showResolveBtn) {
      if (resolving) {
        const sp = createSpinner({ size: 14, color: 'inherit' });
        resolveBtn.el.replaceChildren(sp.el);
      } else {
        resolveBtn.update({ label: props.t('memory.drift.resolve') });
      }
      (resolveBtn.el as HTMLButtonElement).disabled = resolving;
    }
  }

  function render(): void {
    renderTitle();
    renderContent();
    renderActions();
  }
  render();

  // Load detail asynchronously
  let cancelled = false;
  void props.onLoadDetail(props.eventId).then((d) => {
    if (cancelled) return;
    detail = d as MemoryDriftEventDetail | null;
    loading = false;
    render();
  });

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      cancelled = true;
      noteField.destroy();
      closeBtn.destroy();
      resolveBtn.destroy();
      dialog.destroy();
    },
  };
}
