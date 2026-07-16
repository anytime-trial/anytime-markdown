import type { Metadata } from "next";

import TicketsBody from "./TicketsBody";

export const metadata: Metadata = {
  title: "Tickets | Anytime Markdown",
  description:
    "GitHub リポジトリの .tickets/ ディレクトリを正本とする Git ネイティブなチケット管理ボード",
  alternates: { canonical: "/tickets" },
};

export default function TicketsPage() {
  return <TicketsBody />;
}
