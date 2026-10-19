import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledger",
  description: "The contract's totals, and every booking by its id.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
