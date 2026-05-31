import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { getEditorStorage } from "../types";

interface UseEditorDialogsParams {
  editor: Editor | null;
  sourceMode: boolean;
  appendToSource: (md: string) => void;
}

export function useEditorDialogs({
  editor,
  sourceMode,
  appendToSource,
}: UseEditorDialogsParams) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageEditPos, setImageEditPos] = useState<number | null>(null);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  // ImageNodeView からの編集ダイアログ呼び出し (editor.storage 経由)
  useEffect(() => {
    if (!editor) return;
    const handler = (data: { pos: number; src: string; alt: string }) => {
      setImageUrl(data.src || "");
      setImageAlt(data.alt || "");
      setImageEditPos(data.pos);
      setImageDialogOpen(true);
    };
    const storage = getEditorStorage(editor);
    storage.image.onEditImage = handler;
    return () => {
      storage.image.onEditImage = null;
    };
  }, [editor]);

  const handleCommentOpen = useCallback(() => {
    setCommentText("");
    setCommentDialogOpen(true);
  }, []);

  const handleCommentInsert = useCallback(() => {
    if (!editor || !commentText.trim()) return;
    editor.chain().focus().addComment(commentText.trim()).run();
    setCommentDialogOpen(false);
  }, [editor, commentText]);

  // editor.storage 経由でコメントダイアログを開く（BubbleMenu / SlashCommand から利用）
  useEffect(() => {
    if (!editor) return;
    const storage = getEditorStorage(editor);
    if (!storage.commentDialog) storage.commentDialog = {};
    storage.commentDialog.open = handleCommentOpen;
    return () => {
      if (storage.commentDialog) storage.commentDialog.open = null;
    };
  }, [editor, handleCommentOpen]);

  const handleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setLinkUrl("");
    setLinkDialogOpen(true);
  }, [editor]);

  const handleLinkInsert = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.trim() }).run();
    setLinkDialogOpen(false);
  }, [editor, linkUrl]);

  // editor.storage 経由でリンクダイアログを開く
  useEffect(() => {
    if (!editor) return;
    const storage = getEditorStorage(editor);
    if (!storage.linkDialog) storage.linkDialog = {};
    storage.linkDialog.open = handleLink;
    return () => {
      if (storage.linkDialog) storage.linkDialog.open = null;
    };
  }, [editor, handleLink]);

  const handleImage = useCallback(() => {
    if (!editor && !sourceMode) return;
    setImageUrl("");
    setImageAlt("");
    setImageEditPos(null);
    setImageDialogOpen(true);
  }, [editor, sourceMode]);

  const handleImageInsert = useCallback(() => {
    if (!imageUrl.trim()) return;
    if (sourceMode) {
      const alt = imageAlt || "image";
      appendToSource(`![${alt}](${imageUrl.trim()})`);
      setImageDialogOpen(false);
      return;
    }
    if (!editor) return;
    if (imageEditPos === null) {
      editor.chain().focus().setImage({ src: imageUrl.trim(), alt: imageAlt }).run();
    } else {
      const tr = editor.state.tr;
      const node = tr.doc.nodeAt(imageEditPos);
      if (node?.type.name === "image") {
        tr.setNodeMarkup(imageEditPos, undefined, {
          ...node.attrs,
          src: imageUrl.trim(),
          alt: imageAlt,
        });
        editor.view.dispatch(tr);
      }
    }
    setImageDialogOpen(false);
    setImageEditPos(null);
  }, [editor, sourceMode, imageUrl, imageAlt, imageEditPos, appendToSource]);

  return {
    linkDialogOpen,
    setLinkDialogOpen,
    linkUrl,
    setLinkUrl,
    handleLink,
    handleLinkInsert,
    imageDialogOpen,
    setImageDialogOpen,
    imageUrl,
    setImageUrl,
    imageAlt,
    setImageAlt,
    imageEditPos,
    handleImage,
    handleImageInsert,
    commentDialogOpen,
    setCommentDialogOpen,
    commentText,
    setCommentText,
    handleCommentOpen,
    handleCommentInsert,
    shortcutDialogOpen,
    setShortcutDialogOpen,
    versionDialogOpen,
    setVersionDialogOpen,
  };
}
