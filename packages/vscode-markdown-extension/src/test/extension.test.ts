import * as assert from "assert";
import * as vscode from "vscode";

const EXTENSION_ID = "anytime-trial.anytime-markdown";

suite("Extension Test Suite", () => {
  test("Extension should be present", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, "Extension not found");
  });

  test("Extension should activate", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test("Commands should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    const expected = [
      "anytime-markdown.openEditorWithFile",
      "anytime-markdown.compareWithMarkdownEditor",
      "anytime-markdown.compareWithCommit",
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `Command ${cmd} not registered`);
    }
  });
});
