import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useCallback, useState } from "react";

export function DetailsNodeView() {
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <NodeViewWrapper>
      <div className="details-block">
        <div
          className="details-toggle"
          contentEditable={false}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={handleKeyDown}
        >
          <span className="details-arrow">{open ? "\u25BC" : "\u25B6"}</span>
        </div>
        <NodeViewContent
          className={open ? "details-expanded" : "details-collapsed"}
          style={{ padding: "4px 12px" }}
        />
      </div>
    </NodeViewWrapper>
  );
}
