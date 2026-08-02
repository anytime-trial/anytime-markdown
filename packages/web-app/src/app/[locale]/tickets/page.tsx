import type { Metadata } from "next";

import TicketsBody from "./TicketsBody";

export const metadata: Metadata = {
  title: "Tickets",
  description:
    "GitHub リポジトリの .tickets/ ディレクトリを正本とする Git ネイティブなチケット管理ボード",
  alternates: { canonical: "/tickets" },
  // 開発運用向けのボードで検索流入の価値がないため、インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function TicketsPage() {
  return <TicketsBody />;
}
