/**
 * Barrel export files coverage test.
 * Simply importing them covers the re-export statements.
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));
jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

describe("barrel exports", () => {
  it("explorer/index.ts re-exports without error", () => {
    const mod = require("../components/explorer/index");
    expect(mod).toBeDefined();
    // Access each export to trigger coverage
    expect(mod.GitHistorySection).toBeDefined();
    expect(mod.TreeNode).toBeDefined();
  });

  it("explorer/hooks/index.ts re-exports without error", () => {
    const mod = require("../components/explorer/hooks/index");
    expect(mod).toBeDefined();
    expect(mod.useFileSelection).toBeDefined();
    expect(mod.useRepositorySelection).toBeDefined();
    expect(mod.useTreeOperations).toBeDefined();
    expect(mod.useTreeState).toBeDefined();
  });

  it("explorer/sections/index.ts re-exports without error", () => {
    const mod = require("../components/explorer/sections/index");
    expect(mod).toBeDefined();
    expect(mod.BranchDialog).toBeDefined();
    expect(mod.RepoListSection).toBeDefined();
    expect(mod.TreeViewSection).toBeDefined();
  });

  it("explorer/inputs/index.ts re-exports without error", () => {
    const mod = require("../components/explorer/inputs/index");
    expect(mod).toBeDefined();
    expect(mod.NewFileInput).toBeDefined();
    expect(mod.NewFolderInput).toBeDefined();
    expect(mod.RenameInput).toBeDefined();
  });
});
