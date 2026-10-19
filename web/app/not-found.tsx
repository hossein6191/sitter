import { StickerLink } from "@/components/button";

export default function NotFound() {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-3">
      <p className="kicker text-ink-3">404 · a page torn out</p>
      <h1>Nothing written here</h1>
      <p className="text-ink-2">This address is not part of the diary. Bookings live under /booking/B1, /booking/B2 and so on.</p>
      <StickerLink href="/" className="mt-2">
        Back to the first page
      </StickerLink>
    </div>
  );
}
