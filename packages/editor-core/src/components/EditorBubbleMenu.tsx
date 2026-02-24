import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { tooltipWithShortcut } from "../constants/shortcuts";

interface EditorBubbleMenuProps {
  editor: Editor;
  onOpenLinkDialog?: () => void;
}

export function EditorBubbleMenu({ editor, onOpenLinkDialog }: EditorBubbleMenuProps) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state }) => {
        const { selection } = state;
        if (selection.empty) return false;
        if (e.isActive("codeBlock")) return false;
        return true;
      }}
    >
      <div className="bubble-menu">
        <button
          className={`bubble-btn ${editor.isActive("bold") ? "is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title={tooltipWithShortcut("bold")}
        >
          B
        </button>
        <button
          className={`bubble-btn ${editor.isActive("italic") ? "is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title={tooltipWithShortcut("italic")}
        >
          <em>I</em>
        </button>
        <button
          className={`bubble-btn ${editor.isActive("underline") ? "is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title={tooltipWithShortcut("underline")}
        >
          <u>U</u>
        </button>
        <button
          className={`bubble-btn ${editor.isActive("strike") ? "is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title={tooltipWithShortcut("strikethrough")}
        >
          <s>S</s>
        </button>
        <button
          className={`bubble-btn ${editor.isActive("highlight") ? "is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title={tooltipWithShortcut("highlight")}
        >
          H
        </button>
        <button
          className={`bubble-btn ${editor.isActive("code") ? "is-active" : ""}`}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title={tooltipWithShortcut("code")}
        >
          {"<>"}
        </button>
        <button
          className={`bubble-btn ${editor.isActive("link") ? "is-active" : ""}`}
          onClick={() => onOpenLinkDialog?.()}
          title={tooltipWithShortcut("link")}
        >
          Link
        </button>
      </div>
    </BubbleMenu>
  );
}
