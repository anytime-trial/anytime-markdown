import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../components/explorer/helpers", () => ({
  formatCommitDate: (d: string) => d,
  truncateMessage: (m: string) => m,
}));

import { GitHistorySection } from "../components/explorer/GitHistorySection";

const mockCommits = [
  { sha: "abc123", message: "First commit", author: "user", date: "2024-01-01" },
  { sha: "def456", message: "Second commit", author: "user2", date: "2024-01-02" },
];

describe("GitHistorySection", () => {
  it("shows loading spinner", () => {
    const { container } = render(
      <GitHistorySection commits={[]} loading={true} selectedSha={null} onSelectCommit={jest.fn()} />
    );
    expect(container.querySelector("[role='progressbar']")).toBeTruthy();
  });

  it("shows empty message when no commits", () => {
    render(
      <GitHistorySection commits={[]} loading={false} selectedSha={null} onSelectCommit={jest.fn()} />
    );
    expect(screen.getByText("noCommitHistory")).toBeTruthy();
  });

  it("renders commit list", () => {
    render(
      <GitHistorySection commits={mockCommits} loading={false} selectedSha={null} onSelectCommit={jest.fn()} />
    );
    expect(screen.getByText("First commit")).toBeTruthy();
    expect(screen.getByText("Second commit")).toBeTruthy();
  });

  it("calls onSelectCommit when clicking a commit", () => {
    const onSelect = jest.fn();
    render(
      <GitHistorySection commits={mockCommits} loading={false} selectedSha={null} onSelectCommit={onSelect} />
    );
    fireEvent.click(screen.getByText("First commit"));
    expect(onSelect).toHaveBeenCalledWith("abc123");
  });

  it("shows editing item when isDirty", () => {
    const onSelectCurrent = jest.fn();
    render(
      <GitHistorySection
        commits={mockCommits}
        loading={false}
        selectedSha={null}
        onSelectCommit={jest.fn()}
        isDirty={true}
        onSelectCurrent={onSelectCurrent}
      />
    );
    expect(screen.getByText("editing")).toBeTruthy();
  });

  it("shows stale warning", () => {
    render(
      <GitHistorySection
        commits={mockCommits}
        loading={false}
        selectedSha={null}
        onSelectCommit={jest.fn()}
        stale={true}
      />
    );
    expect(screen.getByText("historyMayBeStale")).toBeTruthy();
  });
});
