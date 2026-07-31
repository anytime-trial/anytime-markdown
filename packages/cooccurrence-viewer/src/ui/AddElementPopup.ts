import { hasCooccurrenceTimeline, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { validateAddElementForm, type AddElementFormError } from './addElementModel';
import { createPanelButton, ensureButtonBaseStyles } from './buttonBaseStyle';
import { placeNotePopup } from './notePopupModel';

/** 登録が押されたときに呼び出し側へ渡す値。数値は文字列のまま渡し、解釈は書き込む側が行う。 */
export interface AddElementSubmitValues {
  readonly label: string;
  /** 時間軸を持たない図で使う。 */
  readonly frequency?: string;
  readonly strength?: string;
  /** 時間軸を持つ図で使う。スライスと同じ順序・同じ長さ。空文字は「その期には無い」。 */
  readonly sliceFrequencies?: readonly string[];
  readonly sliceStrengths?: readonly string[];
  /** 追加する語を入れるクラスタ。選ばなければ null。 */
  readonly clusterIndex: number | null;
}

export interface AddElementPopupOptions {
  /** ポップアップを載せる要素。位置はこの要素の左上を原点とする。 */
  container: HTMLElement;
  t: CooccurrenceT;
  /**
   * 登録が押された。ファイルへの書き込みは呼び出し側が行う。
   *
   * 拒まれた理由を返せるのは、検証が UI の側だけでは閉じないため。強度と頻度の整合や
   * スキーマの検査はファイルを組み立てて初めて分かる。
   */
  onSubmit(values: AddElementSubmitValues): { ok: true } | { ok: false; reason: string };
}

export interface AddElementShowInput {
  readonly file: CooccurrenceFile;
  /** 共起の相手になる、いま選んでいる語の添字。 */
  readonly sourceNodeIndex: number;
  /** container の左上を原点とする表示位置。 */
  readonly anchor: { readonly x: number; readonly y: number };
  /**
   * 閉じたときにフォーカスを戻す先。
   *
   * 戻さないとフォーカスが body へ落ち、キーボードの利用者は図の先頭から辿り直しになる
   * （要件書 §2.3）。開いた操作面を呼び出し側が知っているので、そこから渡す。
   */
  readonly returnFocusTo?: HTMLElement;
}

export interface AddElementPopupHandle {
  readonly element: HTMLElement;
  show(input: AddElementShowInput): void;
  hide(): void;
  isOpen(): boolean;
  /** いま共起の相手にしている語の添字。閉じていれば null。 */
  getSourceNodeIndex(): number | null;
  setT(t: CooccurrenceT): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-add-element-popup-style';

/** 対象からの逃がし幅。押したアイコンの真上に出すと、アイコン自体が隠れる。 */
const ANCHOR_OFFSET = 10;
/** 表示領域の縁との最小の間隔。 */
const EDGE_MARGIN = 8;

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-add-popup{position:absolute;z-index:4;width:240px;box-sizing:border-box;padding:10px;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);font:12px system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.3)}
.cooc-add-popup[hidden]{display:none}
.cooc-add-popup__title{margin-bottom:8px;font-weight:600}
.cooc-add-popup__row{display:flex;flex-direction:column;gap:2px;margin-bottom:6px}
.cooc-add-popup__label{color:var(--cooc-text-secondary)}
.cooc-add-popup__input{box-sizing:border-box;width:100%;padding:3px 6px;border:1px solid var(--cooc-divider);border-radius:4px;background:var(--cooc-bg);color:var(--cooc-text);font:inherit}
.cooc-add-popup__error{margin:6px 0;color:var(--cooc-accent);overflow-wrap:anywhere}
.cooc-add-popup__error:empty{display:none}
.cooc-add-popup__buttons{display:flex;gap:6px;justify-content:flex-end}
.cooc-add-popup__button{padding:3px 10px;border:1px solid var(--cooc-divider);border-radius:4px;background:var(--cooc-bg)}
.cooc-add-popup__button:hover{background:var(--cooc-action-hover)}
`;
  document.head.appendChild(style);
}

/**
 * 検証の結果を文言へ写す。
 *
 * Why not キーの表を作って引くか: i18n の検査は翻訳関数の呼び出しに書かれた文字列リテラルを
 * 走査する。表越しに引くと走査から外れ、使っているキーが「参照ゼロ」と判定される
 * （`sliceValueEditor` の setTitle と同じ理由）。
 */
function errorMessage(t: CooccurrenceT, error: AddElementFormError): string {
  switch (error) {
    case 'empty-label':
      return t('edit.errorEmptyLabel');
    case 'duplicate-label':
      return t('edit.errorDuplicateLabel');
    case 'invalid-frequency':
      return t('edit.errorInvalidFrequency');
    case 'invalid-strength':
      return t('edit.errorInvalidStrength');
    case 'no-slice-frequency':
      return t('edit.errorNoSliceFrequency');
    case 'no-slice-strength':
      return t('edit.errorNoSliceStrength');
  }
}

/**
 * 図から語を足す入力ポップアップ（要件書 §2.3）。
 *
 * 開くたびに欄を組み立て直す。スライスの枚数もクラスタの顔ぶれも図の編集で変わるため、
 * 使い回すと前に開いたときの並びが残る。前回の入力を持ち越さない効果も兼ねる。
 */
export function createAddElementPopup(options: AddElementPopupOptions): AddElementPopupHandle {
  ensureStyles();
  let t = options.t;
  let open = false;
  let current: AddElementShowInput | null = null;

  const element = document.createElement('div');
  element.className = 'cooc-add-popup';
  element.dataset.role = 'popup';
  element.hidden = true;
  // モーダルではない。図の選択やパネルの操作は開いたままでも行える（要件書 §2.3）。
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');
  element.setAttribute('aria-label', t('edit.popupLabel'));
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // 既定動作（ホスト側の取り消し等）まで走ると、閉じるだけのつもりが別の操作を巻き込む。
    event.preventDefault();
    hide();
  });
  options.container.appendChild(element);

  const title = document.createElement('div');
  title.className = 'cooc-add-popup__title';
  const fields = document.createElement('div');
  const error = document.createElement('div');
  error.className = 'cooc-add-popup__error';
  error.dataset.role = 'error';
  // 入力の直後に読み上げる。閉じない理由が伝わらないと、押しても何も起きないように見える。
  error.setAttribute('role', 'alert');

  const buttons = document.createElement('div');
  buttons.className = 'cooc-add-popup__buttons';
  const cancelButton = createPanelButton('cooc-add-popup__button');
  cancelButton.dataset.action = 'cancel';
  const submitButton = createPanelButton('cooc-add-popup__button');
  submitButton.dataset.action = 'submit';
  buttons.append(cancelButton, submitButton);
  element.append(title, fields, error, buttons);

  let labelInput: HTMLInputElement | null = null;
  let frequencyInput: HTMLInputElement | null = null;
  let strengthInput: HTMLInputElement | null = null;
  let clusterSelect: HTMLSelectElement | null = null;
  let sliceFrequencyInputs: HTMLInputElement[] = [];
  let sliceStrengthInputs: HTMLInputElement[] = [];

  function addRow(labelText: string, control: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'cooc-add-popup__row';
    const caption = document.createElement('label');
    caption.className = 'cooc-add-popup__label';
    caption.textContent = labelText;
    // 見出しと欄を結ぶ。素の div にすると、支援技術には名前の無い欄が並ぶだけになる。
    const id = `cooc-add-field-${control.dataset.field ?? ''}`;
    control.id = id;
    caption.htmlFor = id;
    row.append(caption, control);
    fields.appendChild(row);
  }

  function numberInput(field: string): HTMLInputElement {
    const input = document.createElement('input');
    input.className = 'cooc-add-popup__input';
    input.type = 'number';
    input.dataset.field = field;
    return input;
  }

  function build(input: AddElementShowInput): void {
    fields.replaceChildren();
    error.textContent = '';
    sliceFrequencyInputs = [];
    sliceStrengthInputs = [];
    const sourceLabel = input.file.spec.nodes[input.sourceNodeIndex]?.label ?? '';

    labelInput = document.createElement('input');
    labelInput.className = 'cooc-add-popup__input';
    labelInput.type = 'text';
    labelInput.dataset.field = 'label';
    addRow(t('edit.label'), labelInput);

    const slices = input.file.spec.timeline?.slices ?? [];
    if (hasCooccurrenceTimeline(input.file.spec)) {
      // 時間軸を持つ図では全体値を直接編集できない（機能仕様書 §2.2）。欄そのものを出さない。
      frequencyInput = null;
      strengthInput = null;
      slices.forEach((slice, index) => {
        const control = numberInput(`sliceFrequency-${index}`);
        sliceFrequencyInputs.push(control);
        addRow(`${t('edit.sliceFrequencies')} ${slice.label}`, control);
      });
      slices.forEach((slice, index) => {
        const control = numberInput(`sliceStrength-${index}`);
        sliceStrengthInputs.push(control);
        // 相手の語をここでも出す。全体値の欄にしか出さないと、時間軸を持つ図では誰との
        // 共起を入力しているのかが画面から読めない（要件書 §2.3）。
        addRow(`${t('edit.sliceStrengths', { source: sourceLabel })} ${slice.label}`, control);
      });
    } else {
      frequencyInput = numberInput('frequency');
      addRow(t('edit.frequency'), frequencyInput);
      strengthInput = numberInput('strength');
      addRow(t('edit.strength', { source: sourceLabel }), strengthInput);
    }

    clusterSelect = document.createElement('select');
    clusterSelect.className = 'cooc-add-popup__input';
    clusterSelect.dataset.field = 'cluster';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = t('words.noCluster');
    clusterSelect.appendChild(none);
    input.file.spec.clusters?.forEach((cluster, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = cluster.label;
      clusterSelect?.appendChild(option);
    });
    addRow(t('edit.cluster'), clusterSelect);

    title.textContent = t('edit.popupLabel');
    cancelButton.textContent = t('edit.cancel');
    submitButton.textContent = t('edit.submit');
  }

  function readValues(): AddElementSubmitValues {
    const layered = sliceFrequencyInputs.length > 0 || sliceStrengthInputs.length > 0;
    const clusterValue = clusterSelect?.value ?? '';
    const base = {
      label: (labelInput?.value ?? '').trim(),
      clusterIndex: clusterValue === '' ? null : Number(clusterValue),
    };
    if (layered) {
      return {
        ...base,
        sliceFrequencies: sliceFrequencyInputs.map((input) => input.value),
        sliceStrengths: sliceStrengthInputs.map((input) => input.value),
      };
    }
    return { ...base, frequency: frequencyInput?.value ?? '', strength: strengthInput?.value ?? '' };
  }

  function submit(): void {
    if (current === null) return;
    const values = readValues();
    const invalid = validateAddElementForm(current.file, values);
    if (invalid !== null) {
      error.textContent = errorMessage(t, invalid);
      return;
    }
    const result = options.onSubmit(values);
    if (!result.ok) {
      error.textContent = t('edit.errorRejected', { reason: result.reason });
      return;
    }
    hide();
  }

  function hide(): void {
    if (!open) return;
    open = false;
    const returnFocusTo = current?.returnFocusTo;
    current = null;
    element.hidden = true;
    // 隠した中の要素はフォーカスを保てない。戻し先が生きているときだけ戻す。
    if (returnFocusTo?.isConnected === true && !returnFocusTo.hidden) returnFocusTo.focus();
  }

  function place(anchor: { x: number; y: number }): void {
    const bounds = options.container.getBoundingClientRect();
    const { left, top } = placeNotePopup({
      anchor,
      size: { width: element.offsetWidth, height: element.offsetHeight },
      bounds: { width: bounds.width, height: bounds.height },
      offset: ANCHOR_OFFSET,
      margin: EDGE_MARGIN,
    });
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  cancelButton.addEventListener('click', () => hide());
  submitButton.addEventListener('click', () => submit());

  return {
    element,
    show(input): void {
      current = input;
      open = true;
      build(input);
      element.hidden = false;
      place(input.anchor);
      labelInput?.focus();
    },
    hide,
    isOpen: () => open,
    getSourceNodeIndex: () => (open ? (current?.sourceNodeIndex ?? null) : null),
    setT(nextT): void {
      t = nextT;
      element.setAttribute('aria-label', t('edit.popupLabel'));
      if (current !== null) build(current);
    },
    destroy(): void {
      element.remove();
    },
  };
}
