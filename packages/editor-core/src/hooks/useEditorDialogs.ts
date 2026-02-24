import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

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
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // ImageNodeView からの編集ダイアログ呼び出し (editor.storage 経由)
  useEffect(() => {
    if (!editor) return;
    const handler = (data: { pos: number; src: string; alt: string }) => {
      setImageUrl(data.src || "");
      setImageAlt(data.alt || "");
      setImageEditPos(data.pos);
      setImageDialogOpen(true);
    };
    const storage = editor.storage as unknown as Record<string, Record<string, unknown>>;
    storage.image.onEditImage = handler;
    return () => {
      storage.image.onEditImage = null;
    };
  }, [editor]);

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
    if (imageEditPos !== null) {
      const tr = editor.state.tr;
      const node = tr.doc.nodeAt(imageEditPos);
      if (node && node.type.name === "image") {
        tr.setNodeMarkup(imageEditPos, undefined, {
          ...node.attrs,
          src: imageUrl.trim(),
          alt: imageAlt,
        });
        editor.view.dispatch(tr);
      }
    } else {
      editor.chain().focus().setImage({ src: imageUrl.trim(), alt: imageAlt }).run();
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
    shortcutDialogOpen,
    setShortcutDialogOpen,
    versionDialogOpen,
    setVersionDialogOpen,
    helpDialogOpen,
    setHelpDialogOpen,
  };
}
