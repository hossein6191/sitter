// The route's own browser title, from the URL alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^B?([1-9]\d{0,8})$/i.exec(id);
  return {
    title: m ? `Booking B${m[1]}` : "Booking",
    description: "One booking's diary: the care instructions, a square for every day with its report, sticker and envelopes, and what happens next.",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
