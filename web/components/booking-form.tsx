"use client";

// Booking a sitter: who sits, the care instructions (a demo care plan in one press, or a list of one's
// own), the days, and the day rate. Everything is checked against the contract's own rules before the
// wallet is asked, and the booking goes through the one write stage every page uses. Once it is final
// the page moves to the new booking's diary, where the demo sitter is asked to accept.

import { useRouter } from "next/navigation";
import * as React from "react";

import { Sticker } from "@/components/button";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { bookedId, bookingPath, calls, isMock } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { DEMO_TERMS, planOf, planOfInstructions } from "@/lib/demo-sitter";
import { durationLabel, gen, tryAtto } from "@/lib/format";
import { signGuide, sendingGuide } from "@/lib/guide";
import { MAX_DAYS, MAX_INSTRUCTION, MAX_INSTRUCTIONS, MIN_LEAD, addressText, bookProblem, instructionsOf, instructionsJson, plain } from "@/lib/rules";
import { DAYS_CHIPS, DAY_LENGTH_CHIPS, INSTRUCTION_CHIPS, PLAN_CHIPS, RATE_CHIPS, START_CHIPS } from "@/lib/suggestions";
import { rememberTx } from "@/lib/tx-memory";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t-2 border-dashed border-rule pt-4 first:border-t-0 first:pt-0">
      <h2 className="flex items-baseline gap-2 text-[1.9rem]">
        <span className="mono text-[1rem] text-ink-3">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

export function BookingForm() {
  const me = useMe();
  const now = useNow();
  const demo = useDemoStatus();
  const router = useRouter();
  const [who, setWho] = React.useState<"demo" | "other">("demo");
  const [other, setOther] = React.useState("");
  const [items, setItems] = React.useState<string[]>(() => [...planOf("biscuit").instructions]);
  const [days, setDays] = React.useState(DEMO_TERMS.days);
  const [daySeconds, setDaySeconds] = React.useState(DEMO_TERMS.daySeconds);
  const [lead, setLead] = React.useState(DEMO_TERMS.leadSeconds);
  const [rateText, setRateText] = React.useState("0.1");
  const [booked, setBooked] = React.useState("");

  const tx = useTx((s, hash) => {
    const id = bookedId(s);
    if (!id) return;
    rememberTx(id, hash, "Booked");
    setBooked(id);
    router.push(bookingPath(id) + "?booked=1");
  });

  const demoSitter = demo?.sitter ?? "";
  const sitter = who === "demo" ? demoSitter : addressText(other);
  const cleaned = items.map((i) => plain(i));
  const rate = tryAtto(rateText);
  const plan = planOfInstructions(cleaned);
  const value = rate !== null ? rate * BigInt(days) : 0n;
  const lines = cleaned.filter((i) => i !== "");
  const listProblem = instructionsOf(instructionsJson(lines)).problem;
  const problem = !now
    ? ""
    : who === "demo" && !demoSitter
      ? demo === null
        ? "Asking the site's server for the demo sitter's address…"
        : "The demo sitter is away (" + (demo.reason || "no reason given") + "); book someone else's address, or try again later."
      : rate === null
        ? "Enter the day rate in GEN, like 0.1."
        : bookProblem({ owner: me.address, sitter: who === "demo" ? demoSitter : other, items: lines, rateAtto: rate, days, daySeconds, startAt: now + lead, now });
  const demoOff = who === "demo" && !plan;

  const send = () => {
    if (problem || rate === null || !now) return;
    void tx.start(calls.book(sitter, lines, rate, days, daySeconds, now + lead));
  };

  const setItem = (k: number, v: string) => setItems((xs) => xs.map((x, i) => (i === k ? v : x)));
  const addItem = (v = "") =>
    setItems((xs) => {
      const kept = v === "" ? xs : xs.filter((x) => x.trim() !== "");
      return kept.length >= MAX_INSTRUCTIONS ? xs : [...kept, v];
    });
  const removeItem = (k: number) => setItems((xs) => (xs.length <= 1 ? [""] : xs.filter((_, i) => i !== k)));
  const label = `Booking ${who === "demo" ? "the demo sitter" : "a sitter"} for ${days} ${days === 1 ? "day" : "days"}`;
  const busy = tx.sending || (!!tx.hash && !tx.final);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex flex-col gap-5">
        <Step n={1} title="Who sits">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip" aria-pressed={who === "demo"} onClick={() => setWho("demo")}>
              <span>The demo sitter</span>
              <span className="mono shrink-0 rounded-full bg-card px-1.5 text-[11px] font-normal text-ink-3">{demo === null ? "asking…" : demo.online ? "online" : "away"}</span>
            </button>
            <button type="button" className="chip" aria-pressed={who === "other"} onClick={() => setWho("other")}>
              <span>Someone else&apos;s address</span>
            </button>
          </div>
          {who === "demo" ? (
            <p className="text-[0.9rem] text-ink-2">
              The demo sitter is a key held by this site&apos;s server{demoSitter ? <> (<span className="mono">{demoSitter.slice(0, 8)}…</span>)</> : null}. It accepts a booking with one of
              the three demo care plans word for word, and files one of four fixed reports when you press its buttons in the diary. It never sends anything you type.
            </p>
          ) : (
            <div>
              <label className="label" htmlFor="sitter-address">
                The sitter&apos;s address
              </label>
              <input id="sitter-address" className="field mono text-[0.9rem]" placeholder="0x…" value={other} onChange={(e) => setOther(e.target.value)} spellCheck={false} autoComplete="off" />
              <Suggest
                label="Sitter suggestions"
                chips={[
                  ...(demoSitter ? [{ label: "The demo sitter's address", value: demoSitter }] : []),
                  { label: "Clear", value: "" },
                ]}
                onPick={(v) => setOther(v)}
              />
            </div>
          )}
        </Step>

        <Step n={2} title="The care instructions">
          <p className="text-[0.9rem] text-ink-2">
            One action per line: each line is paid on its own, and a line done in part is not done. Up to {MAX_INSTRUCTIONS} lines of {MAX_INSTRUCTION} characters.
          </p>
          <Suggest label="Demo care plans" chips={PLAN_CHIPS} onPick={(k) => setItems([...planOf(k).instructions])} isOn={(k) => plan?.key === k} />
          <ol className="ruled mt-1 flex flex-col">
            {items.map((item, k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="mono w-5 shrink-0 text-[0.8rem] text-ink-3">{k + 1}.</span>
                <input
                  aria-label={`Instruction ${k + 1}`}
                  className="field hand text-[1.3rem] leading-tight"
                  value={item}
                  maxLength={MAX_INSTRUCTION + 20}
                  onChange={(e) => setItem(k, e.target.value)}
                  placeholder="Feed Biscuit her morning meal"
                />
                <button type="button" onClick={() => removeItem(k)} aria-label={`Remove instruction ${k + 1}`} className="shrink-0 rounded-full px-2 text-lg leading-none text-ink-3 hover:bg-brick-wash hover:text-brick-ink">
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Sticker size="sm" variant="paper" disabled={items.length >= MAX_INSTRUCTIONS} onClick={() => addItem()}>
              Add a line
            </Sticker>
            <span className="text-[0.8rem] text-ink-3">
              {lines.length} of {MAX_INSTRUCTIONS}
            </span>
          </div>
          <Suggest label="Instruction suggestions" chips={INSTRUCTION_CHIPS} onPick={(v) => addItem(v)} />
          {listProblem && lines.length > 0 && <p className="text-[0.85rem] text-brick-ink">{listProblem.charAt(0).toUpperCase() + listProblem.slice(1)}.</p>}
          {demoOff && (
            <p className="rounded-xl border-2 border-dashed border-amber bg-amber-wash px-3 py-2 text-[0.85rem]">
              This list is not one of the demo care plans word for word, so the demo sitter will not accept it. Press a plan above, or book someone else&apos;s address.
            </p>
          )}
        </Step>

        <Step n={3} title="The days">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="days">
                How many days
              </label>
              <input id="days" type="number" min={1} max={MAX_DAYS} className="field mono" value={days} onChange={(e) => setDays(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
              <Suggest label="Day counts" chips={DAYS_CHIPS} onPick={setDays} isOn={(v) => v === days} />
            </div>
            <div>
              <span className="label">How long a day lasts</span>
              <p className="mono py-1.5 text-[0.95rem]">{durationLabel(daySeconds)}</p>
              <Suggest label="Day lengths" chips={DAY_LENGTH_CHIPS} onPick={setDaySeconds} isOn={(v) => v === daySeconds} />
            </div>
            <div>
              <span className="label">Day 1 starts</span>
              <p className="mono py-1.5 text-[0.95rem]">in {durationLabel(lead)}</p>
              <Suggest label="Start times" chips={START_CHIPS} onPick={setLead} isOn={(v) => v === lead} />
            </div>
          </div>
          <p className="text-[0.85rem] text-ink-3">
            Day 1 starts at least {durationLabel(MIN_LEAD)} after the booking lands, so the sitter has time to accept. Each day&apos;s report is taken from its start until 30 minutes
            after its end.
          </p>
        </Step>

        <Step n={4} title="The day rate">
          <div className="max-w-xs">
            <label className="label" htmlFor="rate">
              GEN a day
            </label>
            <input id="rate" inputMode="decimal" className="field mono" value={rateText} onChange={(e) => setRateText(e.target.value.trim())} />
            <Suggest label="Day rates" chips={RATE_CHIPS} onPick={setRateText} isOn={(v) => v === rateText} />
          </div>
        </Step>
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <div className="sheet p-4">
          <p className="kicker text-plum">The booking</p>
          <p className="hand mt-1 text-[1.7rem] leading-tight font-bold text-ink">
            {plan ? plan.title : lines.length ? `${lines.length} instruction${lines.length === 1 ? "" : "s"} of your own` : "No instructions yet"}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.88rem]">
            <dt className="text-ink-3">Sitter</dt>
            <dd className="mono min-w-0 truncate">{who === "demo" ? "the demo sitter" : sitter || "—"}</dd>
            <dt className="text-ink-3">Days</dt>
            <dd>
              {days} × {durationLabel(daySeconds)}
            </dd>
            <dt className="text-ink-3">Day rate</dt>
            <dd className="mono">{rate !== null ? gen(rate) : "—"}</dd>
            {rate !== null && lines.length > 0 && (
              <>
                <dt className="text-ink-3">A line</dt>
                <dd className="mono">{gen(rate / BigInt(lines.length))} a day</dd>
              </>
            )}
            <dt className="text-ink-3">You pay now</dt>
            <dd className="mono font-bold text-plum-deep">{rate !== null ? gen(value) : "—"}</dd>
          </dl>
          <p className="mt-2 text-[0.82rem] text-ink-2">
            The contract holds it, not the sitter. Each day&apos;s rate is released only when that day&apos;s report is read: the sitter&apos;s share for the lines shown done, the rest
            back to you. Until the sitter accepts you can withdraw all of it.
          </p>
          <div className="mt-3">
            <WalletGate need={value} what="to book">
              <Sticker block disabled={!!problem || busy || !!booked || demoOff || !me.ready} onClick={send}>
                {busy ? "Booking…" : booked ? `Booked ${booked}` : `Book and pay ${rate !== null ? gen(value) : ""}`}
              </Sticker>
            </WalletGate>
            {problem && <p className={cx("mt-2 text-[0.82rem]", problem.endsWith("…") ? "text-ink-3" : "text-brick-ink")}>{problem.charAt(0).toUpperCase() + problem.slice(1).replace(/([^.…])$/, "$1.")}</p>}
            {isMock && <p className="mt-2 text-[0.78rem] text-ink-3">In the demo build you book as the account chosen in the strip above.</p>}
          </div>
        </div>
        <TxStage
          tx={tx}
          sign={signGuide({ fn: "book", label, amountAtto: value.toString(), mock: isMock })}
          sending={sendingGuide({ fn: "book", label, amountAtto: value.toString(), mock: isMock })}
          label={label}
        />
      </aside>
    </div>
  );
}
