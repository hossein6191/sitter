import { StickerLink } from "@/components/button";
import { Checklist, DayBadge, Envelope } from "@/components/diary";
import { planOf } from "@/lib/demo-sitter";
import { stickerOf } from "@/lib/days";

const biscuit = planOf("biscuit");
const RATE = "500000000000000000";

const SAMPLE = [
  { day: 1, mask: "11111", text: biscuit.scripts[0].text, state: "paid" as const, toSitter: "500000000000000000", toOwner: "0" },
  { day: 2, mask: "11011", text: biscuit.scripts[1].text, state: "paid" as const, toSitter: "400000000000000000", toOwner: "100000000000000000" },
  { day: 3, mask: "", text: biscuit.scripts[2].text, state: "unclear" as const, toSitter: "0", toOwner: "0" },
];

const PROMISE = [
  ["You write the care instructions first", "Before anything is paid, one action per line: “Give Biscuit her heart pill”. Nobody can change the list afterwards."],
  ["You pay for every day up front", "The contract holds the money, not the sitter. Until the sitter accepts, you can take all of it back."],
  ["Each day the sitter reports in plain words", "Every validator reads the report against every instruction, four ways, and they must agree on one mask: 11011 means the third was not shown done."],
  ["That day's money moves at once", "The sitter gets the share for the lines shown done and the rest comes back to you, in the same transaction. A vague report is unclear: the sitter pays a 0.01 GEN fee to you and may report once more."],
];

const MONEY = [
  { reading: "11111", what: "every line shown done", sitter: RATE, owner: "0", fee: false },
  { reading: "11011", what: "the pill was forgotten", sitter: "400000000000000000", owner: "100000000000000000", fee: false },
  { reading: "unclear", what: "“All fine, Biscuit is happy!”", sitter: "0", owner: "0", fee: true },
  { reading: "window ended", what: "no clear report in time", sitter: "0", owner: RATE, fee: false },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <p className="kicker text-sage-ink">A sitter&apos;s diary, kept by a contract</p>
          <h1>Paid day by day, for what the report shows done.</h1>
          <p className="max-w-xl text-[1.05rem] text-ink-2">
            Sitter holds the money for a pet or house sitting booking and releases it one day at a time. Each evening the validators read the sitter&apos;s report against
            every care instruction the owner wrote, agree on which were done, and pay that day&apos;s share for exactly those. The rest goes back to the owner.
          </p>
          <div className="flex flex-wrap gap-3">
            <StickerLink href="/book">Book the demo sitter</StickerLink>
            <StickerLink href="/how" variant="paper">
              How it works
            </StickerLink>
          </div>
          <p className="text-[0.85rem] text-ink-3">
            The demo sitter answers within a minute, on days of ten minutes, so a whole booking fits in one sitting. All it needs is a wallet on GenLayer Studio and some
            free test GEN.
          </p>
        </div>

        <div className="sheet p-4" aria-label="A sample page of the diary">
          <div className="flex items-baseline justify-between gap-2">
            <p className="hand text-[1.9rem] leading-none font-bold text-plum-deep">Biscuit the cat</p>
            <p className="mono text-[0.75rem] text-ink-3">0.5 GEN a day</p>
          </div>
          <p className="mt-1 text-[0.8rem] text-ink-3">Day 2, read by the network:</p>
          <Checklist className="mt-1" items={biscuit.instructions} mask="11011" />
          <ol className="mt-4 grid grid-cols-3 gap-2">
            {SAMPLE.map((d) => {
              const sticker = stickerOf({ state: d.state, mask: d.mask, of: 5, tries: 1 });
              return (
                <li key={d.day} className="relative flex min-h-[9.5rem] min-w-0 flex-col rounded-[12px] border-2 border-dashed border-line-strong bg-card p-2">
                  <span className="hand text-[1.45rem] leading-none font-bold text-plum-deep">Day {d.day}</span>
                  {sticker && <DayBadge sticker={sticker} small className="absolute -top-3 -right-2 scale-90" />}
                  <span className="hand mt-1.5 line-clamp-3 text-[0.98rem] leading-[1.15] text-ink">&ldquo;{d.text}&rdquo;</span>
                  <span className="mt-auto flex flex-col gap-0.5 pt-1.5">
                    {d.toSitter !== "0" && <Envelope amountAtto={d.toSitter} to="sitter" role="owner" />}
                    {d.toOwner !== "0" && <Envelope amountAtto={d.toOwner} to="owner" role="owner" />}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>The promise in one minute</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {PROMISE.map(([title, body], i) => (
            <li key={title} className="flex gap-3 rounded-[14px] border-2 border-dashed border-line-strong bg-card p-3.5">
              <span className="hand flex size-10 shrink-0 items-center justify-center rounded-full bg-plum text-[1.5rem] font-bold text-white">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-extrabold text-ink">{title}</span>
                <span className="mt-0.5 block text-[0.92rem] text-ink-2">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4">
        <h2>How the money moves</h2>
        <p className="max-w-2xl text-ink-2">
          Biscuit&apos;s owner pays 0.5 GEN a day for five instructions, so each line is worth 0.1 GEN a day. One day&apos;s envelopes, depending on what the report shows:
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MONEY.map((m) => (
            <li key={m.reading} className="sheet flex flex-col gap-2 p-3.5">
              <span className="mono text-[1.15rem] font-semibold text-plum-deep">{m.reading}</span>
              <span className="text-[0.88rem] text-ink-2">{m.what}</span>
              <span className="mt-auto flex flex-col gap-1">
                {m.sitter !== "0" && <Envelope amountAtto={m.sitter} to="sitter" role="owner" />}
                {m.owner !== "0" && <Envelope amountAtto={m.owner} to="owner" role="owner" />}
                {m.fee && <Envelope amountAtto="10000000000000000" to="owner" role="owner" />}
                {m.fee && <span className="text-[0.75rem] text-ink-3">the fee, from the sitter&apos;s credit; the day&apos;s 0.5 GEN stays held for one re-report</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="max-w-2xl text-[0.9rem] text-ink-3">
          Nothing else moves the money. Withdrawing an unaccepted offer, a sitter declining, or the owner ending the booking early sends the untouched days straight back.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Start</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          <li className="sheet flex flex-col gap-2 p-4">
            <p className="hand text-[1.6rem] leading-none font-bold text-plum-deep">As an owner</p>
            <p className="text-[0.9rem] text-ink-2">Book the demo sitter with Biscuit, Pepper or the house on Juniper Lane, and press its report buttons to watch each day settle.</p>
            <StickerLink href="/book" size="sm" className="mt-auto self-start">
              Book
            </StickerLink>
          </li>
          <li className="sheet flex flex-col gap-2 p-4">
            <p className="hand text-[1.6rem] leading-none font-bold text-plum-deep">As a sitter</p>
            <p className="text-[0.9rem] text-ink-2">Accept the bookings made to your address, keep a little credit for report fees, and write each day&apos;s report.</p>
            <StickerLink href="/sitting" size="sm" variant="sage" className="mt-auto self-start">
              Sitting
            </StickerLink>
          </li>
          <li className="sheet flex flex-col gap-2 p-4">
            <p className="hand text-[1.6rem] leading-none font-bold text-plum-deep">To check it</p>
            <p className="text-[0.9rem] text-ink-2">The four questions word for word, who may do what, where every atto goes, and what the network cannot see.</p>
            <StickerLink href="/how" size="sm" variant="paper" className="mt-auto self-start">
              How it works
            </StickerLink>
          </li>
        </ul>
      </section>
    </div>
  );
}
