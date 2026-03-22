import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// signIn is from next-auth/react which maps to __mocks__/next-auth.js
// We need to add signIn to the mock
jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { RepoListSection } from "../components/explorer/sections/RepoListSection";

const mockRepos = [
  { fullName: "user/repo1", private: false, defaultBranch: "main" },
  { fullName: "user/repo2", private: true, defaultBranch: "master" },
];

describe("RepoListSection", () => {
  it("shows sign-in button when needs auth", () => {
    render(
      <RepoListSection needsAuth={true} loading={false} repos={[]} onSelectRepo={jest.fn()} />
    );
    expect(screen.getByText("signInWithGitHub")).toBeTruthy();
  });

  it("shows loading spinner", () => {
    const { container } = render(
      <RepoListSection needsAuth={false} loading={true} repos={[]} onSelectRepo={jest.fn()} />
    );
    expect(container.querySelector("[role='progressbar']")).toBeTruthy();
  });

  it("renders repo list", () => {
    render(
      <RepoListSection needsAuth={false} loading={false} repos={mockRepos} onSelectRepo={jest.fn()} />
    );
    expect(screen.getByText("user/repo1")).toBeTruthy();
    expect(screen.getByText("user/repo2")).toBeTruthy();
  });

  it("calls onSelectRepo when clicking a repo", () => {
    const onSelect = jest.fn();
    render(
      <RepoListSection needsAuth={false} loading={false} repos={mockRepos} onSelectRepo={onSelect} />
    );
    fireEvent.click(screen.getByText("user/repo1"));
    expect(onSelect).toHaveBeenCalledWith(mockRepos[0]);
  });

  it("shows empty message when no repos", () => {
    render(
      <RepoListSection needsAuth={false} loading={false} repos={[]} onSelectRepo={jest.fn()} />
    );
    expect(screen.getByText("noRepositoriesFound")).toBeTruthy();
  });
});
