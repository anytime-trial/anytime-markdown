import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";
import { createAgentEditPlugin, ensureAgentEditStyles } from "../extensions/agentEditPlugin";
import { installAgentEdits } from "../host/chrome/agentEdits";
import { setContentBypassingSectionLock } from "../extensions/sectionLockPlugin";

const content = '<h1>T</h1><h2>A</h2><p>alpha</p><h2>B</h2><p>beta</p><h2>A</h2><p>again</p>';
let editor: Editor;
beforeEach(() => { editor = new Editor({ extensions: [StarterKit], content }); });
afterEach(() => editor.destroy());
function position(text: string): number {
  let result = -1;
  editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) result = pos; });
  if (result < 0) throw new Error(text);
  return result;
}
function decorated(): string[] {
  return Array.from(editor.view.dom.querySelectorAll('[data-am-agent-edit="recent"]'), el => el.textContent ?? '');
}
it('set decorates only the selected section and replaces previous targets', () => {
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## A' }]);
  expect(decorated()).toEqual(['A', 'alpha']);
  controller.set([{ heading: '## B' }]);
  expect(decorated()).toEqual(['B', 'beta']);
  controller.clear();
  expect(decorated()).toEqual([]);
  controller.dispose();
});
it('human insertion acknowledges only the edited section without losing the edit', () => {
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## A' }, { heading: '## B' }]);
  editor.commands.insertContentAt(position('alpha'), 'X');
  expect(editor.state.doc.textContent).toContain('Xalpha');
  expect(controller.getUi()).toEqual([{ headingIndex: 2 }]);
  expect(decorated()).toEqual(['B', 'beta']);
  controller.dispose();
});
it('external setContent preserves the marks', () => {
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## A' }]);
  setContentBypassingSectionLock(editor, content.replace('alpha', 'external'));
  expect(decorated()).toEqual(['A', 'external']);
  controller.dispose();
});
it('resolves level and occurrence and ignores unresolved targets', () => {
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## A', occurrence: 2 }, { heading: '# A' }, { heading: 'missing' }, { heading: '## A', occurrence: 3 }]);
  expect(controller.getUi()).toEqual([{ headingIndex: 3 }]);
  expect(decorated()).toEqual(['A', 'again']);
  controller.acknowledge(3);
  expect(decorated()).toEqual([]);
  controller.dispose();
});
it('reports each section once using original coordinates across multiple steps', () => {
  const onHumanEdit = jest.fn();
  const A = { level: 2, text: 'A', occurrence: 1 };
  const B = { level: 2, text: 'B', occurrence: 1 };
  editor.registerPlugin(createAgentEditPlugin({ getUiState: () => [A, B], onHumanEdit }));
  const tr = editor.state.tr;
  tr.insertText('long insertion', position('alpha'));
  tr.insertText('Y', tr.mapping.map(position('beta')));
  tr.insertText('Z', tr.mapping.map(position('alpha')));
  editor.view.dispatch(tr);
  expect(onHumanEdit.mock.calls).toEqual([[A], [B]]);
});
it('keeps the mark on the same section when a heading is inserted above (review #1)', () => {
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## B' }]);
  expect(controller.getUi()).toEqual([{ headingIndex: 2 }]);
  // 人が上の節（A の本文末尾）に見出しを挿入する: B の index は 2 → 3 へずれる
  editor.commands.insertContentAt(position('alpha') + 5, '<h2>Inserted</h2>');
  expect(controller.getUi()).toEqual([{ headingIndex: 3 }]);
  expect(decorated()).toEqual(['B', 'beta']);
  // 外部変更の再読込で上に見出しが増えても同じ
  setContentBypassingSectionLock(editor, content.replace('<h2>A</h2>', '<h2>New</h2><p>n</p><h2>A</h2>'));
  expect(decorated()).toEqual(['B', 'beta']);
  controller.dispose();
});
it('matches headings that contain inline markdown such as code spans (review #5)', () => {
  editor.destroy();
  editor = new Editor({ extensions: [StarterKit], content: '<h2><code>get_section</code> tool</h2><p>body</p>' });
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## `get_section` tool' }]);
  expect(decorated()).toEqual(['get_section tool', 'body']);
  controller.dispose();
});
it('detects mark changes with empty step maps', () => {
  const controller = installAgentEdits({ editor });
  controller.set([{ heading: '## A' }]);
  editor.chain().setTextSelection({ from: position('alpha'), to: position('alpha') + 5 }).toggleBold().run();
  expect(decorated()).toEqual([]);
  controller.dispose();
});
it('installs styles idempotently', () => {
  ensureAgentEditStyles(document);
  ensureAgentEditStyles(document);
  expect(document.querySelectorAll('#am-agent-edit-styles')).toHaveLength(1);
  expect(document.getElementById('am-agent-edit-styles')?.textContent).toContain('--am-color-agent-main');
});
