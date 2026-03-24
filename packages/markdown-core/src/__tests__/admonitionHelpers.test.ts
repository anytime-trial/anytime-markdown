/**
 * preprocessAdmonition 単体テスト
 *
 * admonitionHelpers.ts の preprocessAdmonition 関数を
 * エディタインスタンスなしで検証する。
 */
import { preprocessAdmonition } from "../utils/admonitionHelpers";

describe("preprocessAdmonition", () => {
  describe("単一の Admonition", () => {
    it.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])("%s タイプを変換する", (type) => {
      const md = `> [!${type}]\n> This is a ${type.toLowerCase()} message.`;
      const result = preprocessAdmonition(md);
      expect(result).toContain(`<blockquote data-admonition-type="${type.toLowerCase()}">`);
      expect(result).toContain(`This is a ${type.toLowerCase()} message.`);
      expect(result).toContain("</blockquote>");
    });

    it("小文字の type も認識する", () => {
      const md = "> [!note]\n> lowercase admonition";
      const result = preprocessAdmonition(md);
      expect(result).toContain('data-admonition-type="note"');
      expect(result).toContain("lowercase admonition");
    });
  });

  describe("複数の連続した Admonition", () => {
    it("空行で区切られた2つの Admonition を個別に変換する", () => {
      const md = [
        "> [!NOTE]",
        "> First note.",
        "",
        "> [!WARNING]",
        "> Be careful!",
      ].join("\n");
      const result = preprocessAdmonition(md);
      expect(result).toContain('data-admonition-type="note"');
      expect(result).toContain("First note.");
      expect(result).toContain('data-admonition-type="warning"');
      expect(result).toContain("Be careful!");
    });

    it("空行なしで連続する Admonition も個別に変換する", () => {
      const md = [
        "> [!TIP]",
        "> Tip content.",
        "> [!CAUTION]",
        "> Caution content.",
      ].join("\n");
      const result = preprocessAdmonition(md);
      expect(result).toContain('data-admonition-type="tip"');
      expect(result).toContain("Tip content.");
      expect(result).toContain('data-admonition-type="caution"');
      expect(result).toContain("Caution content.");
    });
  });

  describe("コードブロック内の Admonition", () => {
    it("コードブロック内の > [!NOTE] は変換しない", () => {
      const md = [
        "```markdown",
        "> [!NOTE]",
        "> This should not be processed.",
        "```",
      ].join("\n");
      const result = preprocessAdmonition(md);
      expect(result).not.toContain("data-admonition-type");
      expect(result).toContain("> [!NOTE]");
    });

    it("コードブロック外の Admonition は変換し、内部はそのまま保持する", () => {
      const md = [
        "> [!NOTE]",
        "> Real admonition.",
        "",
        "```",
        "> [!WARNING]",
        "> Inside code block.",
        "```",
      ].join("\n");
      const result = preprocessAdmonition(md);
      expect(result).toContain('data-admonition-type="note"');
      expect(result).toContain("Real admonition.");
      // コードブロック内の WARNING は変換されない
      expect(result).not.toContain('data-admonition-type="warning"');
      expect(result).toContain("> [!WARNING]");
    });
  });

  describe("Admonition を含まないテキスト", () => {
    it("通常のテキストはそのまま返す", () => {
      const md = "# Hello\n\nThis is a paragraph.";
      const result = preprocessAdmonition(md);
      expect(result).toBe(md);
    });

    it("空文字列はそのまま返す", () => {
      expect(preprocessAdmonition("")).toBe("");
    });
  });

  describe("通常の blockquote（Admonition ではない）", () => {
    it("通常の blockquote は変換しない", () => {
      const md = "> This is a normal blockquote.\n> Second line.";
      const result = preprocessAdmonition(md);
      expect(result).not.toContain("data-admonition-type");
      expect(result).toBe(md);
    });

    it("ネストされた blockquote は変換しない", () => {
      const md = "> > Nested blockquote.";
      const result = preprocessAdmonition(md);
      expect(result).not.toContain("data-admonition-type");
      expect(result).toBe(md);
    });
  });

  describe("複数行の内容を持つ Admonition", () => {
    it("複数行の content を正しく収集する", () => {
      const md = [
        "> [!IMPORTANT]",
        "> First line.",
        "> Second line.",
        "> Third line.",
      ].join("\n");
      const result = preprocessAdmonition(md);
      expect(result).toContain('data-admonition-type="important"');
      expect(result).toContain("First line.");
      expect(result).toContain("Second line.");
      expect(result).toContain("Third line.");
    });

    it("空行の > を含む複数行 content を収集する", () => {
      const md = [
        "> [!NOTE]",
        "> Paragraph one.",
        ">",
        "> Paragraph two.",
      ].join("\n");
      const result = preprocessAdmonition(md);
      expect(result).toContain('data-admonition-type="note"');
      expect(result).toContain("Paragraph one.");
      expect(result).toContain("Paragraph two.");
    });

    it("> プレフィックスが除去された内容が blockquote に含まれる", () => {
      const md = "> [!TIP]\n> Use `preprocessAdmonition` for conversion.";
      const result = preprocessAdmonition(md);
      // > プレフィックスが除去されていること
      expect(result).toContain("Use `preprocessAdmonition` for conversion.");
      expect(result).not.toMatch(/^>\s.*preprocessAdmonition/m);
    });
  });
});
