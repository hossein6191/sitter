"use client";

// One booking's diary. At the top, who sits for whom, on what terms, and where the money is, with one
// waiting note that says what is happening now, how long, whether anything is needed from you, whether
// you can leave and where the money is, and the button that is open right now (accept, decline,
// withdraw, end early, close a day). Below, the week planner: a square for every day that fills with
// the sitter's report and gets its sticker and its envelopes. The day picked in the planner opens
// underneath: its checklist ticked from the agreed mask, every report filed on it, its own waiting note,
// and the report form for the sitter or the demo sitter's report buttons for a demo care plan.

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { StickerLink, Sticker } from "@/components/button";
import { CreditCard } from "@/components/credit-card";
import { DemoAccept, DemoReports } from "@/components/demo-actions";
import { Checklist, DayBadge, DayEnvelopes, Envelope, WeekCalendar, useSelectedDay } from "@/components/diary";
import { IconExternal } from "@/components/icons";
import { Placeholder, ReadError } from "@/components/read-state";
import { ReportForm } from "@/components/report-form";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitNote, waitOf } from "@/components/wait-note";
import { addressUrl, calls, isMock, readBooking, readDays, txUrl } from "@/lib/chain";
import { liveDay, stickerOf } from "@/lib/days";
import { planOfInstructions } from "@/lib/demo-sitter";
import { clockTime, durationLabel, gen, short } from "@/lib/format";
import { bookingGuide, dayGuide, focusDay, sendingGuide, signGuide, type Guide, type Role } from "@/lib/guide";
import { MAX_REPORTS, parseBookingId, started } from "@/lib/rules";
import { parseRemembered, rememberTx, rememberedRaw } from "@/lib/tx-memory";
import type { Booking, Call, Day } from "@/lib/types";

export default function BookingPage() {
  const params = useParams<{ id: string }>();
  const id = parseBookingId(String(params?.id ?? ""));
  if (!id)
    return (
      <div className="flex max-w-2xl flex-col items-start gap-3">
        <h1>That is not a booking id</h1>
        <p className="text-ink-2">Bookings are B1, B2 and so on. Yours are under My bookings.</p>
        <StickerLink href="/mine">My bookings</StickerLink>
      </div>
    );
  return <Diary key={id} id={id} />;
}

/** What one action of this page is doing, for its waiting note. */
type Doing = { call: Call; label: string; sign: Guide; sending: Guide };

function Diary({ id }: { id: string }) {
  const me = useMe();
  const now = useNow();
  const demo = useDemoStatus();
  const booking = useRead(() => readBooking(id), [id]);
  const days = useRead(() => readDays(id), [id]);
  const refreshBoth = React.useCallback(async () => {
    await Promise.all([booking.refresh(), days.refresh()]);
  }, [booking, days]);
  useAfterTx(refreshBoth);

  // Another browser (the sitter's, or the demo sitter on the server) may move the booking: read again
  // every 30 s while it is still going. The mock only moves when this tab acts.
  const status = booking.data?.status;
  const refreshRef = React.useRef(refreshBoth);
  React.useEffect(() => {
    refreshRef.current = refreshBoth;
  });
  React.useEffect(() => {
    if (isMock || (status !== "offered" && status !== "active")) return;
    const t = setInterval(() => void refreshRef.current(), 30_000);
    return () => clearInterval(t);
  }, [status]);

  const [doing, setDoing] = React.useState<Doing | null>(null);
  const tx = useTx((_s, hash, call) => {
    rememberTx(id, hash, doing?.label ?? call.fn);
  });
  const remembered = parseRemembered(useLocal(() => rememberedRaw(id), ""));

  const b = booking.data;
  const rows = React.useMemo(() => days.data?.rows ?? [], [days.data]);
  const live = React.useMemo(() => (b ? rows.map((d) => liveDay(b, d, now)) : []), [b, rows, now]);
  const focus = b ? focusDay(live, now, b) : null;
  const [selected, setSelected] = useSelectedDay(live, focus?.day ?? 0);

  if (booking.loading || (days.loading && !days.data))
    return (
      <div className="flex flex-col gap-4">
        <Placeholder lines={2} />
        <Placeholder lines={6} />
      </div>
    );
  if (booking.error) return <ReadError detail={booking.error} onRetry={booking.retry} />;
  if (!b)
    return (
      <div className="flex max-w-2xl flex-col items-start gap-3">
        <h1>No booking {id}</h1>
        <p className="text-ink-2">The contract holds no booking with this id yet. Ids are given out in order, B1 first.</p>
        <StickerLink href="/ledger">The ledger</StickerLink>
      </div>
    );

  const role: Role = me.address && me.address === b.owner ? "owner" : me.address && me.address === b.sitter ? "sitter" : "visitor";
  const plan = planOfInstructions(b.instructions);
  const isDemo = !!plan && !!demo?.sitter && demo.sitter === b.sitter;
  const opts = { mock: isMock, demo: isDemo };
  const guide = bookingGuide(b, live, role, now, opts);
  const day = live.find((d) => d.day === selected) ?? null;
  const begun = now ? started(b, now) : 0;
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const total = BigInt(b.dayRateAtto) * BigInt(b.days);

  const act = (call: Call, label: string, amountAtto = "0") => {
    const d: Doing = { call, label, sign: signGuide({ fn: call.fn, label, amountAtto, role, mock: isMock }), sending: sendingGuide({ fn: call.fn, label, id, amountAtto, role, mock: isMock }) };
    setDoing(d);
    void tx.start(call);
  };

  // The buttons open right now on the booking as a whole.
  const actions: React.ReactNode[] = [];
  if (b.status === "offered" && role === "owner")
    actions.push(
      <Sticker key="withdraw" variant="brick" size="sm" disabled={busy} onClick={() => act(calls.withdrawBooking(id), `Withdrawing ${id}`, total.toString())}>
        Withdraw the offer, {gen(total)} back
      </Sticker>,
    );
  if (b.status === "offered" && role === "sitter") {
    if (now < b.startAt)
      actions.push(
        <Sticker key="accept" size="sm" disabled={busy} onClick={() => act(calls.accept(id), `Accepting ${id}`)}>
          Accept the booking
        </Sticker>,
      );
    actions.push(
      <Sticker key="decline" variant="paper" size="sm" disabled={busy} onClick={() => act(calls.decline(id), `Declining ${id}`, total.toString())}>
        Decline it
      </Sticker>,
    );
  }
  if (b.status === "active" && role === "owner" && now && begun < b.lastDay) {
    const refund = (BigInt(b.lastDay - begun) * BigInt(b.dayRateAtto)).toString();
    actions.push(
      <Sticker key="end" variant="paper" size="sm" disabled={busy} onClick={() => act(calls.end(id), `Ending ${id} early`, refund)}>
        End early: {gen(refund)} back
      </Sticker>,
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="kicker text-sage-ink">
            Booking <span className="mono">{id}</span> · {b.status}
            {role !== "visitor" && <> · you are the {role}</>}
          </p>
          <h1>{plan ? plan.title : "A sitting booking"}</h1>
          <p className="text-ink-2">
            {b.days} {b.days === 1 ? "day" : "days"} of {durationLabel(b.daySeconds)} at <span className="mono">{gen(b.dayRateAtto)}</span> a day, from{" "}
            {clockTime(b.startAt, now || undefined)}. Each of the {b.instructions.length} instructions is worth{" "}
            <span className="mono">{gen(BigInt(b.dayRateAtto) / BigInt(Math.max(1, b.instructions.length)))}</span> a day.
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[0.88rem]">
            <dt className="text-ink-3">Owner</dt>
            <dd className="min-w-0 truncate">
              <a className="mono link" href={addressUrl(b.owner)} target="_blank" rel="noreferrer">
                {short(b.owner)}
              </a>
              {role === "owner" && " (you)"}
            </dd>
            <dt className="text-ink-3">Sitter</dt>
            <dd className="min-w-0 truncate">
              <a className="mono link" href={addressUrl(b.sitter)} target="_blank" rel="noreferrer">
                {short(b.sitter)}
              </a>
              {role === "sitter" && " (you)"}
              {isDemo && " · the demo sitter"}
            </dd>
          </dl>
        </div>
        <div className="sheet flex flex-col gap-2 p-4">
          <p className="kicker text-plum">The money</p>
          <p className="text-[0.9rem]">
            <span className="mono text-[1.3rem] font-semibold text-plum-deep">{gen(b.heldAtto)}</span> <span className="text-ink-2">held by the contract now</span>
          </p>
          <div className="flex flex-col gap-1">
            <Envelope amountAtto={b.toSitterAtto} to="sitter" role={role} />
            <Envelope amountAtto={b.toOwnerAtto} to="owner" role={role} />
          </div>
          {BigInt(b.feesToOwnerAtto) > 0n && <p className="text-[0.8rem] text-ink-3">plus {gen(b.feesToOwnerAtto)} in report fees for unclear readings, to the owner</p>}
          {b.judged > 0 && (
            <p className="text-[0.8rem] text-ink-3">
              {b.done} of {b.judged} instructions shown done over the paid days
            </p>
          )}
        </div>
      </section>

      <WaitNote wait={waitOf(guide, { action: actions.length ? <div className="flex flex-wrap gap-2">{actions}</div> : undefined })} />

      {b.status === "offered" && isDemo && role !== "sitter" && now < b.startAt && (
        <DemoAccept booking={b} auto={role === "owner" && !!demo?.online} onDone={() => void refreshBoth()} />
      )}
      {b.status === "offered" && plan === null && demo?.sitter === b.sitter && (
        <p className="rounded-xl border-2 border-dashed border-amber bg-amber-wash px-3 py-2 text-[0.88rem]">
          This booking was made to the demo sitter, but its instructions are not one of the three demo care plans word for word, so the demo sitter will not accept it.
          Withdraw it to have everything back.
        </p>
      )}

      {doing && <TxStage tx={tx} sign={doing.sign} sending={doing.sending} label={doing.label} />}

      <section className="flex flex-col gap-3">
        <h2>The days</h2>
        {days.error ? (
          <ReadError detail={days.error} onRetry={days.retry} />
        ) : (
          <WeekCalendar booking={b} days={rows} now={now} selected={selected} onSelect={setSelected} role={role} />
        )}
      </section>

      {day && (
        <DayPage key={day.day} booking={b} day={day} role={role} now={now} plan={isDemo ? plan : null} me={me.address} onStart={() => setSelected(day.day)} onDone={() => void refreshBoth()} />
      )}

      {role === "sitter" && (b.status === "active" || b.status === "offered") && <CreditCard address={me.address} compact />}

      {remembered.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3>Sent from this browser</h3>
          <ul className="flex flex-col gap-1 text-[0.85rem]">
            {remembered.map((r) => (
              <li key={r.hash} className="flex flex-wrap items-center gap-x-2">
                <span className="text-ink-2">{r.label}</span>
                <a className="mono link inline-flex items-center gap-1 text-ink-3" href={txUrl(r.hash)} target="_blank" rel="noreferrer">
                  {r.hash.slice(0, 10)}…
                  <IconExternal size={11} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[0.85rem] text-ink-3">
        <Link className="link" href="/mine">
          My bookings
        </Link>{" "}
        ·{" "}
        <Link className="link" href="/how">
          How a report is read
        </Link>
      </p>
    </div>
  );
}

function DayPage({
  booking,
  day,
  role,
  now,
  plan,
  me,
  onStart,
  onDone,
}: {
  booking: Booking;
  day: Day;
  role: Role;
  now: number;
  plan: ReturnType<typeof planOfInstructions>;
  me: string;
  /** an action on this day began: the planner keeps this day open while it lands */
  onStart: () => void;
  onDone: () => void;
}) {
  const guide = dayGuide(booking, day, role, now, { mock: isMock, demo: !!plan });
  const sticker = stickerOf(day);
  const tx = useTx((_s, hash) => rememberTx(booking.id, hash, `Closed day ${day.day}`));
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const label = `Closing day ${day.day} of ${booking.id}`;
  const lastMask = day.mask || day.reports[day.reports.length - 1]?.mask || "";
  const again = day.tries > 0 && day.tries < MAX_REPORTS;
  const close =
    day.state === "closable" && role !== "sitter" ? (
      <Sticker
        variant="sage"
        size="sm"
        disabled={busy}
        onClick={() => {
          onStart();
          void tx.start(calls.closeDay(booking.id, day.day));
        }}
      >
        Close day {day.day}
      </Sticker>
    ) : undefined;
  return (
    <section className="sheet relative flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={`day-${day.day}-title`}>
      {sticker && <DayBadge sticker={sticker} className="absolute -top-4 right-3" />}
      <div className="pr-20">
        <p className="kicker text-plum">
          {clockTime(day.opens, now || undefined)} to {clockTime(day.opens + booking.daySeconds, now || undefined)} · report until {clockTime(day.closes, now || undefined)}
        </p>
        <h2 id={`day-${day.day}-title`}>Day {day.day}</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <Checklist
            items={booking.instructions}
            mask={day.state === "paid" ? day.mask : ""}
            unread={
              lastMask === "unclear"
                ? "The last reading was unclear: no instruction is ticked or crossed until a reading agrees on a mask."
                : day.state === "closed" || day.state === "closable"
                  ? "No clear reading: nothing was ticked."
                  : "Nothing is ticked until the day's report is read."
            }
          />
          <DayEnvelopes day={day} role={role} />
          {day.reports.length > 0 && (
            <ol className="flex flex-col gap-2">
              {day.reports.map((r, i) => (
                <li key={i} className="rounded-[12px] border-2 border-dashed border-line-strong bg-paper-2/60 p-3">
                  <p className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-ink-3">
                    <span className="font-extrabold tracking-wide uppercase">{i === 0 ? "The report" : "The re-report"}</span>
                    <span>
                      {clockTime(r.at, now || undefined)} · read as <span className="mono text-ink">{r.mask}</span>
                    </span>
                  </p>
                  <p className="hand mt-1 text-[1.3rem] leading-snug text-ink">&ldquo;{r.text}&rdquo;</p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <WaitNote wait={waitOf(guide, { action: close })} />
          <TxStage tx={tx} sign={signGuide({ fn: "close_day", label, amountAtto: booking.dayRateAtto, role, mock: isMock })} sending={sendingGuide({ fn: "close_day", label, id: booking.id, amountAtto: booking.dayRateAtto, role, mock: isMock })} label={label} />
          {role === "sitter" && <ReportForm open={day.canReport} booking={booking} day={day.day} again={again} sitter={me} onStart={onStart} onDone={onDone} />}
          {plan && role !== "sitter" && <DemoReports open={day.canReport && booking.status === "active"} booking={booking} plan={plan} day={day.day} again={again} onStart={onStart} onDone={onDone} />}
        </div>
      </div>
    </section>
  );
}
