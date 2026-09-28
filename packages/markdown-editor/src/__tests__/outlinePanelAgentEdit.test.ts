import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";
import { createOutlinePanel } from "../components-vanilla/OutlinePanel";
import { installAgentEdits } from "../host/chrome/agentEdits";

it('renders and acknowledges agent buttons on refresh transactions alongside locks', () => {
  const editor = new Editor({ extensions: [StarterKit], content: '<h1>T</h1><h2>A</h2><p>alpha</p>' });
  const controller = installAgentEdits({ editor });
  const onAcknowledgeAgentEdit = jest.fn(controller.acknowledge);
  const panel = createOutlinePanel({
    editor, t: k => k, outlineWidth: 240, editorHeight: 600, onOutlineClick: () => {},
    getAgentEdits: controller.getUi, onAcknowledgeAgentEdit,
    getSectionLocks: () => [{ headingIndex: 1, tampered: false }], onToggleSectionLock: () => {},
  });
  expect(panel.el.querySelector('[data-am-outline-agent-edit]')).toBeNull();
  controller.set([{ heading: '## A' }]);
  const buttons = panel.el.querySelectorAll<HTMLButtonElement>('[data-am-outline-agent-edit="recent"]');
  expect(buttons).toHaveLength(1);
  const button = buttons[0];
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('aria-label')).toBe('outlineAgentEditAcknowledge');
  expect(button.title).toBe('outlineAgentEditAcknowledge');
  expect(button.parentElement?.querySelector('[data-am-outline-lock="locked"]')).not.toBeNull();
  button.click();
  expect(onAcknowledgeAgentEdit).toHaveBeenCalledWith(1);
  expect(panel.el.querySelector('[data-am-outline-agent-edit]')).toBeNull();
  panel.destroy();
  controller.dispose();
  editor.destroy();
});
