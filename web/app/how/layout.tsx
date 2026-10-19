import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works",
  description: "The four questions word for word, why GenLayer, where every atto goes, the limits, and the contract's own rules read live.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
