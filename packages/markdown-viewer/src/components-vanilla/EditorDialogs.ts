/**
 * 脱React の vanilla DOM「EditorDialogs」ファクトリ
 * （framework-decoupling Phase 3 / G2・追加のみ・本番未配線）。
 *
 * React 原版 `components/EditorDialogs.tsx`（MUI Dialog 群）を素 DOM へ移植したもの。
 * comment / link / image の入力ダイアログ + shortcuts / version の情報ダイアログを提供する。
 *
 * React 版は 5 ダイアログを `open` boolean で制御表示していたが、vanilla 版は ui-vanilla の
 * createDialog（self-append: 生成時に document.body へ自前マウントし destroy で閉じる）に合わせ、
 * `openComment()` / `openLink()` / `openImage()` / `openShortcuts()` / `openVersion()` の
 * imperative API にする（同時に開くのは 1 つ。新規 open は既存を閉じてから開く）。
 *
 * 変換規約:
 * - React props（open boolean + value + setter + handler）→ opts のコールバック
 *   （onCommentInsert(text) / onLinkInsert(url) / onImageInsert(url, alt)）＋ open メソッド引数。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。
 * - 入力検証（touched + required）は closure で管理し、TextField の error/helperText を更新する。
 */

import {
  createButton,
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogTitle,
  createText,
  createTextField,
  nextDialogTitleId,
  svgIcon,
  type TextFieldHandle,
} from "@anytime-markdown/ui-core";
import { SHORTCUT_HINT_FONT_SIZE } from "../constants/dimensions";
import { KEYBOARD_SHORTCUTS } from "../constants/shortcuts";
import { APP_VERSION } from "../version";
import type { TranslationFn } from "../types";

// ui/icons.tsx と同一の Material SVG path（HelpCenter / InfoOutlined）。
const ICON_HELP_CENTER =
  "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-6.99 15c-.7 0-1.26-.56-1.26-1.26 0-.71.56-1.25 1.26-1.25.71 0 1.25.54 1.25 1.25-.01.69-.54 1.26-1.25 1.26m3.01-7.4c-.76 1.11-1.48 1.46-1.87 2.17-.16.29-.22.48-.22 1.41h-1.82c0-.49-.08-1.29.31-1.98.49-.87 1.42-1.39 1.96-2.16.57-.81.25-2.33-1.37-2.33-1.06 0-1.58.8-1.8 1.48l-1.65-.7C9.01 7.15 10.22 6 11.99 6c1.48 0 2.49.67 3.01 1.52.44.72.7 2.07.02 3.08";
const ICON_INFO_OUTLINED =
  "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8";

/** {@link createEditorDialogs} のオプション（React `EditorDialogsProps` の vanilla 置換）。 */
interface CreateEditorDialogsOptions {
  /** i18n。 */
  t: TranslationFn;
  /** comment 挿入確定（入力テキストを渡す）。 */
  onCommentInsert: (text: string) => void;
  /** link 挿入確定（URL を渡す）。 */
  onLinkInsert: (url: string) => void;
  /** image 挿入確定（URL と alt を渡す）。 */
  onImageInsert: (url: string, alt: string) => void;
  /** Web import URL 確定。mode は挿入または新規ドキュメント作成経路を示す。 */
  onWebImportSubmit?: (url: string, mode: "insert" | "create") => void | Promise<void>;
  /** image ダイアログの挿入ボタンを「適用」表記にする（編集モード）。 */
  imageEditMode?: boolean;
}

/** {@link createEditorDialogs} の戻り値。各 open* で 1 ダイアログを開く（同時に 1 つ）。 */
export interface EditorDialogsHandle {
  openComment: (initialText?: string) => void;
  openLink: (initialUrl?: string) => void;
  openWebImport: (mode?: "insert" | "create", initialUrl?: string) => void;
  openImage: (initialUrl?: string, initialAlt?: string) => void;
  openShortcuts: () => void;
  openVersion: () => void;
  /** 開いているダイアログを閉じる。 */
  closeAll: () => void;
  /** 開いているダイアログを破棄し以降の open を無効化する。 */
  destroy: () => void;
}

/** ロゴ URI（グローバル注入があれば優先、なければ既定パス）。React 版と同一。 */
function logoUri(): string {
  const injected = (globalThis as unknown as Record<string, unknown>).__LOGO_URI__;
  return typeof injected === "string" && injected ? injected : "/images/camel_markdown.png";
}

/**
 * vanilla EditorDialogs を生成する。createDialog の self-append により open* で即時に開き、
 * 閉じる/挿入/destroy で破棄する。
 */
export function createEditorDialogs(opts: CreateEditorDialogsOptions): EditorDialogsHandle {
  const { t } = opts;
  let destroyed = false;

  // 現在開いているダイアログ（dialog + 子ハンドルをまとめて破棄するクロージャ）。同時に 1 つ。
  let current: { destroy: () => void } | null = null;

  const close = (): void => {
    current?.destroy();
    current = null;
  };

  /**
   * Dialog シェル（title + content + actions）を組み立てて開く。`childHandles` は dialog と一緒に
   * destroy する子（Button/TextField）を集約する。返す destroy が current に入る。
   */
  const openShell = (config: {
    titleId: string;
    titleChildren: Node | string;
    content: Node;
    actions?: Node;
    maxWidth?: "xs" | "sm" | "md";
    fullWidth?: boolean;
    childHandles: Array<{ destroy: () => void }>;
  }): void => {
    if (destroyed) return;
    close();
    const children: Node[] = [
      createDialogTitle({ id: config.titleId, children: config.titleChildren }).el,
      config.content,
    ];
    if (config.actions) children.push(config.actions);
    const dialog = createDialog({
      onClose: close,
      labelledBy: config.titleId,
      maxWidth: config.maxWidth ?? "sm",
      fullWidth: config.fullWidth ?? true,
      children,
    });
    current = {
      destroy() {
        for (const h of config.childHandles) h.destroy();
        dialog.destroy();
      },
    };
  };

  /** タイトル行（アイコン + ラベル）を組む（shortcuts / version ダイアログ用）。 */
  const titleRow = (iconPath: string, label: string): HTMLElement => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";
    const icon = svgIcon(iconPath, 20);
    icon.style.color = "var(--am-color-text-secondary)";
    const span = document.createElement("span");
    span.textContent = label;
    row.append(icon, span);
    return row;
  };

  // --- 入力ダイアログ共通: insert ボタンの活性を field 値に追従させる ---------
  const openInputDialog = (config: {
    titleId: string;
    title: string;
    fields: HTMLElement[];
    fieldHandles: TextFieldHandle[];
    submitLabel: string;
    canSubmit: () => boolean;
    onSubmit: () => void;
    /** field 値変更時に insert ボタンの disabled を再評価するための購読登録口。 */
    bindRevalidate: (revalidate: () => void) => void;
  }): void => {
    const content = createDialogContent({ children: config.fields }).el;
    const cancelBtn = createButton({ label: t("cancel"), onClick: close });
    const insertBtn = createButton({
      label: config.submitLabel,
      variant: "contained",
      disabled: !config.canSubmit(),
      onClick: config.onSubmit,
    });
    config.bindRevalidate(() => insertBtn.update({ disabled: !config.canSubmit() }));
    const actions = createDialogActions({ children: [cancelBtn.el, insertBtn.el] }).el;
    openShell({
      titleId: config.titleId,
      titleChildren: config.title,
      content,
      actions,
      childHandles: [...config.fieldHandles, cancelBtn, insertBtn],
    });
  };

  return {
    openComment(initialText = "") {
      const titleId = nextDialogTitleId();
      let value = initialText;
      let touched = false;
      const isEmpty = (): boolean => !value.trim();
      const field = createTextField({
        autoFocus: true,
        required: true,
        multiline: true,
        minRows: 2,
        maxRows: 8,
        label: t("commentPrompt"),
        value,
        size: "small",
        fullWidth: true,
        helperTextId: "comment-helper",
        style: { marginTop: "8px" },
        onChange: (e) => {
          value = (e.target as HTMLTextAreaElement).value;
          revalidate();
        },
        onBlur: () => {
          touched = true;
          field.update({ error: isEmpty(), helperText: isEmpty() ? t("requiredField") : undefined });
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isEmpty()) submit();
        },
      });
      const submit = (): void => {
        if (isEmpty()) return;
        opts.onCommentInsert(value);
        close();
      };
      let revalidate = (): void => {};
      openInputDialog({
        titleId,
        title: t("comment"),
        fields: [field.el],
        fieldHandles: [field],
        submitLabel: t("insert"),
        canSubmit: () => !isEmpty(),
        onSubmit: submit,
        bindRevalidate: (fn) => {
          revalidate = () => {
            fn();
            if (touched) field.update({ error: isEmpty() });
          };
        },
      });
    },

    openLink(initialUrl = "") {
      const titleId = nextDialogTitleId();
      let value = initialUrl;
      const isEmpty = (): boolean => !value.trim();
      const field = createTextField({
        autoFocus: true,
        required: true,
        label: t("linkUrl"),
        value,
        size: "small",
        fullWidth: true,
        helperTextId: "link-url-helper",
        style: { marginTop: "8px" },
        onChange: (e) => {
          value = (e.target as HTMLInputElement).value;
          revalidate();
        },
        onBlur: () => {
          field.update({ error: isEmpty(), helperText: isEmpty() ? t("requiredField") : undefined });
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" && !isEmpty()) submit();
        },
      });
      const submit = (): void => {
        if (isEmpty()) return;
        opts.onLinkInsert(value);
        close();
      };
      let revalidate = (): void => {};
      openInputDialog({
        titleId,
        title: t("link"),
        fields: [field.el],
        fieldHandles: [field],
        submitLabel: t("insert"),
        canSubmit: () => !isEmpty(),
        onSubmit: submit,
        bindRevalidate: (fn) => {
          revalidate = fn;
        },
      });
    },

    openWebImport(mode = "insert", initialUrl = "") {
      const titleId = nextDialogTitleId();
      let value = initialUrl;
      let loading = false;
      const isEmpty = (): boolean => !value.trim();
      const loadingText = createText({
        variant: "caption",
        text: "",
        style: "display:block;margin-top:8px;color:var(--am-color-text-secondary);",
      });
      const field = createTextField({
        autoFocus: true,
        required: true,
        label: t("webImportUrlPlaceholder"),
        value,
        size: "small",
        fullWidth: true,
        helperTextId: "web-import-url-helper",
        style: { marginTop: "8px" },
        onChange: (e) => {
          value = (e.target as HTMLInputElement).value;
          revalidate();
        },
        onBlur: () => {
          field.update({ error: isEmpty(), helperText: isEmpty() ? t("requiredField") : undefined });
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" && !isEmpty() && !loading) void submit();
        },
      });
      const setLoading = (next: boolean): void => {
        loading = next;
        field.update({ disabled: loading });
        insertBtn.update({ disabled: loading || isEmpty(), label: loading ? t("webImportLoading") : t("webImportSubmit") });
        loadingText.el.textContent = loading ? t("webImportLoading") : "";
      };
      const submit = async (): Promise<void> => {
        if (isEmpty() || loading) return;
        setLoading(true);
        try {
          await opts.onWebImportSubmit?.(value, mode);
          close();
        } catch {
          setLoading(false);
        }
      };
      let revalidate = (): void => {};
      const content = createDialogContent({ children: [field.el, loadingText.el] }).el;
      const cancelBtn = createButton({ label: t("cancel"), onClick: close });
      const insertBtn = createButton({
        label: t("webImportSubmit"),
        variant: "contained",
        disabled: isEmpty(),
        onClick: () => void submit(),
      });
      revalidate = () => insertBtn.update({ disabled: loading || isEmpty() });
      const actions = createDialogActions({ children: [cancelBtn.el, insertBtn.el] }).el;
      openShell({
        titleId,
        titleChildren: t("webImportDialogTitle"),
        content,
        actions,
        childHandles: [field, loadingText, cancelBtn, insertBtn],
      });
    },

    openImage(initialUrl = "", initialAlt = "") {
      const titleId = nextDialogTitleId();
      let url = initialUrl;
      let alt = initialAlt;
      const isData = (): boolean => url.startsWith("data:");
      const isEmpty = (): boolean => !url.trim();
      const urlField = createTextField({
        autoFocus: !isData(),
        required: true,
        label: t("imageUrl"),
        value: isData() ? "(base64)" : url,
        disabled: isData(),
        size: "small",
        fullWidth: true,
        helperTextId: "image-url-helper",
        style: { marginTop: "8px" },
        onChange: (e) => {
          url = (e.target as HTMLInputElement).value;
          revalidate();
        },
        onBlur: () => {
          urlField.update({ error: isEmpty(), helperText: isEmpty() ? t("requiredField") : undefined });
        },
      });
      const altField = createTextField({
        label: t("altText"),
        placeholder: t("altTextPlaceholder"),
        helperText: t("altTextGuidance"),
        value: alt,
        size: "small",
        fullWidth: true,
        style: { marginTop: "16px" },
        onChange: (e) => {
          alt = (e.target as HTMLInputElement).value;
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" && !isEmpty()) submit();
        },
      });
      const submit = (): void => {
        if (isEmpty()) return;
        opts.onImageInsert(url, alt);
        close();
      };
      let revalidate = (): void => {};
      openInputDialog({
        titleId,
        title: t("image"),
        fields: [urlField.el, altField.el],
        fieldHandles: [urlField, altField],
        submitLabel: opts.imageEditMode ? t("apply") : t("insert"),
        canSubmit: () => !isEmpty(),
        onSubmit: submit,
        bindRevalidate: (fn) => {
          revalidate = fn;
        },
      });
    },

    openShortcuts() {
      const titleId = nextDialogTitleId();
      const body = document.createElement("div");
      for (const group of KEYBOARD_SHORTCUTS) {
        const groupEl = document.createElement("div");
        groupEl.style.cssText = "margin-bottom:12px;";
        const heading = createText({
          variant: "subtitle2",
          text: t(group.categoryKey),
          style: "color:var(--am-color-text-secondary);margin-bottom:4px;",
        });
        groupEl.appendChild(heading.el);
        for (const item of group.items) {
          const itemRow = document.createElement("div");
          itemRow.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;" +
            "padding:4px 8px;border-radius:4px;";
          const desc = createText({ variant: "body2", text: t(item.descKey) });
          const keysBox = document.createElement("div");
          keysBox.style.cssText = "display:flex;gap:4px;";
          for (const key of item.keys.split("+")) {
            const keyEl = document.createElement("span");
            keyEl.textContent = key;
            keyEl.style.cssText =
              "padding:2px 6px;min-width:28px;text-align:center;" +
              "background-color:var(--am-color-action-selected);border-radius:2px;" +
              `font-family:monospace;font-size:${SHORTCUT_HINT_FONT_SIZE};font-weight:600;` +
              "border:1px solid var(--am-color-divider);line-height:1.4;";
            keysBox.appendChild(keyEl);
          }
          itemRow.append(desc.el, keysBox);
          groupEl.appendChild(itemRow);
        }
        body.appendChild(groupEl);
      }
      const content = createDialogContent({ children: body, dividers: true }).el;
      openShell({
        titleId,
        titleChildren: titleRow(ICON_HELP_CENTER, t("shortcuts")),
        content,
        childHandles: [],
      });
    },

    openVersion() {
      const titleId = nextDialogTitleId();
      const body = document.createElement("div");

      const headerRow = document.createElement("div");
      headerRow.style.cssText = "display:flex;align-items:center;gap:12px;";
      const logo = document.createElement("img");
      logo.src = logoUri();
      logo.alt = "Anytime Markdown";
      logo.style.cssText = "width:40px;height:40px;";
      const name = createText({ variant: "h6", text: t("versionName"), style: "font-weight:700;" });
      headerRow.append(logo, name.el);
      body.appendChild(headerRow);

      const secondary = "color:var(--am-color-text-secondary);";
      const version = createText({ variant: "caption", text: `v${APP_VERSION}`, style: secondary });
      const desc = createText({ variant: "body2", text: t("versionDescription"), style: "margin-top:16px;" });
      const copyright = createText({ variant: "caption", text: t("versionCopyright"), style: `display:block;margin-top:16px;${secondary}` });
      const license = createText({ variant: "caption", text: t("versionLicense"), style: `display:block;margin-top:4px;${secondary}` });
      body.append(version.el, desc.el, copyright.el, license.el);

      const content = createDialogContent({ children: body, dividers: true }).el;
      const closeBtn = createButton({ label: t("close"), color: "inherit", onClick: close });
      const actions = createDialogActions({ children: closeBtn.el }).el;
      openShell({
        titleId,
        titleChildren: titleRow(ICON_INFO_OUTLINED, t("versionInfo")),
        content,
        actions,
        maxWidth: "xs",
        childHandles: [closeBtn],
      });
    },

    closeAll() {
      close();
    },

    destroy() {
      destroyed = true;
      close();
    },
  };
}
