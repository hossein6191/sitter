import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sitting",
  description: "For sitters: offers to accept or decline, today's reports to write, and the credit that pays report fees.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
