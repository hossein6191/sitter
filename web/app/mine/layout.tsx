import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My bookings",
  description: "Every booking you are a party to, as the owner or the sitter, with what happens next and where the money is.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
