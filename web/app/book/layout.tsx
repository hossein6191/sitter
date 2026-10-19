import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book a sitter",
  description: "Book the demo sitter or any address: the care instructions, the days and the day rate, paid up front and held day by day.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
