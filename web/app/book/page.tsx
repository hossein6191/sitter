import { BookingForm } from "@/components/booking-form";

export default function BookPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex max-w-3xl flex-col gap-2">
        <p className="kicker text-sage-ink">A new page of the diary</p>
        <h1>Book a sitter</h1>
        <p className="text-ink-2">
          Write the care instructions, pick the days and the day rate, and pay for every day now. The contract holds it and pays the sitter one day at a time, for the
          instructions each day&apos;s report shows done. The quickest way to see it work is the demo sitter, with one of its three care plans and days of ten minutes.
        </p>
      </div>
      <BookingForm />
    </div>
  );
}
