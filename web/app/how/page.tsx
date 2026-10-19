"use client";

// How it works, in the contract's own words: the four askings word for word, how their answers combine
// into one value, why this needs GenLayer, who may do what, where every atto goes, what the network
// cannot see, and the contract's rules() read live from the chain.

import { Placeholder, ReadError } from "@/components/read-state";
import { useRead } from "@/components/use-read";
import { readRules } from "@/lib/chain";
import { gen } from "@/lib/format";
import {
  MAX_ANSWER,
  MAX_DAYS,
  MAX_INSTRUCTION,
  MAX_INSTRUCTIONS,
  MAX_RATE,
  MAX_REPORT,
  MIN_INSTRUCTION,
  MIN_LEAD,
  MIN_RATE,
  MIN_REPORT,
  QUESTION_DONE,
  QUESTION_NOT_DONE,
  READING,
  REPORT_FEE,
  REPORT_GRACE,
  RETURN_LIST,
} from "@/lib/rules";

const WHO = [
  ["book (payable)", "anyone; the sender is the owner, the sitter another address", "day 1 starts 5 minutes to 90 days later"],
  ["withdraw_booking", "the owner", "while the offer is not accepted"],
  ["decline", "the sitter", "while the offer is not accepted"],
  ["accept", "the sitter", "before day 1 starts"],
  ["deposit (payable)", "anyone, into its own credit", "any time"],
  ["withdraw", "anyone, its own credit", "any time"],
  ["report", "the sitter", "inside the day's window; once, and once more only after an unclear reading"],
  ["close_day", "anyone", "once the day's window has ended without a clear reading"],
  ["end", "the owner", "while some day has not begun"],
];

const MONEY = [
  ["book", "the owner pays exactly day rate × days; the contract holds it"],
  ["withdraw_booking, decline", "everything back to the owner"],
  ["report, a mask", "the sitter gets day rate × done ÷ instructions (rounded down), the owner the rest of that day's rate; the fee stays in the sitter's credit"],
  ["report, unclear", `nothing from the escrow; ${gen(REPORT_FEE)} from the sitter's credit to the owner; one re-report left`],
  ["close_day", "the day's rate back to the owner"],
  ["end", "the day rate for every day not yet begun back to the owner"],
  ["deposit, withdraw", "the caller's own credit, in and out"],
  ["a refused book or deposit", "everything sent comes back in the same transaction"],
];

const LIMITS = [
  ["The report is the sitter's claim, not a fact.", "The network reads words. It never sees the cat, the bowls or the ferns. A sitter who writes “gave the pill” without giving it is paid for it; what the owner keeps is a record, on chain for good and signed by the sitter, of exactly what was claimed each day."],
  ["Images are not read.", `A report is printable ASCII on one line, ${MIN_REPORT} to ${MAX_REPORT} characters.`],
  ["Every instruction weighs the same.", "The day rate is split evenly, so the pill and the ferns are worth the same. The same instruction twice is refused."],
  ["One action per instruction.", "Partly done is not done: one meal of two does not carry out “feed her at 8 and at 6”. Write each part as its own line to have each part paid."],
  ["A vague report costs the fee.", "So does a report that shows nothing done. The second report on a day is the last; after that the day waits for its window to end and goes back to the owner."],
  ["The rule against vague reports is words the model reads.", "Code cannot tell “all fine” read as everything done from a report that names every line; the rule every asking carries is what stops it."],
  ["Models can disagree.", "A report that validators read differently gets no consensus: nothing is stored, nothing is charged, and it can be sent again."],
  ["Days are windows, not calendar days.", `Day d runs from start + (d − 1) × day length, for one day length, and takes its report until ${REPORT_GRACE / 60} minutes after it ends.`],
  ["Not audited.", "It runs on GenLayer Studio, a test network, with test GEN."],
];

function Quote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-[12px] border-l-4 border-plum bg-plum-wash/60 px-4 py-3">
      <figcaption className="kicker text-plum">{label}</figcaption>
      <blockquote className="mt-1 text-[0.95rem] text-ink">{children}</blockquote>
    </figure>
  );
}

function LiveRules() {
  const rules = useRead(() => readRules(), []);
  if (rules.loading) return <Placeholder lines={5} />;
  if (rules.error) return <ReadError detail={rules.error} onRetry={rules.retry} />;
  const r = rules.data ?? {};
  const report = (r.report ?? {}) as Record<string, unknown>;
  const askings = Array.isArray(report.askings) ? (report.askings as string[]) : [];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.9rem] text-ink-2">Read from the contract just now. These are the words every validator&apos;s model is given:</p>
      <ol className="flex flex-col gap-1.5 text-[0.88rem]">
        {askings.map((a) => (
          <li key={a} className="rounded-[10px] border-2 border-dashed border-line-strong bg-card px-3 py-2">
            {a}
          </li>
        ))}
      </ol>
      <details className="rounded-[12px] border-2 border-dashed border-line-strong bg-card px-3 py-2">
        <summary className="cursor-pointer font-extrabold">The whole of rules(), as returned</summary>
        <pre className="mono mt-2 max-h-[28rem] overflow-auto text-[0.72rem] leading-relaxed break-words whitespace-pre-wrap text-ink-2">{JSON.stringify(r, null, 2)}</pre>
      </details>
    </div>
  );
}

export default function HowPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <p className="kicker text-sage-ink">The rules at the back of the diary</p>
        <h1>How it works</h1>
        <p className="text-ink-2">
          The owner books a sitter with one to {MAX_INSTRUCTIONS} care instructions of {MIN_INSTRUCTION} to {MAX_INSTRUCTION} characters, a day rate of {gen(MIN_RATE)} to{" "}
          {gen(MAX_RATE)}, and 1 to {MAX_DAYS} days, and pays for every day at once. Day 1 starts at least {MIN_LEAD / 60} minutes later, so the sitter can accept. Each day
          the sitter files one report, and that day&apos;s money moves on what the network agrees the report shows.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2>The four askings, word for word</h2>
        <p className="text-ink-2">
          A report is one consensus round. Every validator asks its model these two questions itself, each in two numberings: the instructions as the owner listed them, and
          reversed and numbered 1 to n again, so a model that answers by position instead of by reading gives different lines in the two. The contract maps the reversed
          answers back.
        </p>
        <Quote label="DONE">{QUESTION_DONE}</Quote>
        <Quote label="NOT DONE">{QUESTION_NOT_DONE}</Quote>
        <Quote label="The rules every asking carries">{READING}</Quote>
        <Quote label="The answer">{RETURN_LIST}</Quote>
        <p className="text-[0.9rem] text-ink-2">
          Answers are asked in JSON mode and read strictly: the whole reply must be {"{"}&quot;answer&quot;: [...]{"}"} or a bare list, at most {MAX_ANSWER} characters, with
          distinct whole numbers from 1 to n. Nothing is searched for inside prose. The instructions and the report are fenced and marked as untrusted before the model sees
          them, and the model never sees an amount, an address or a clock.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How the answers become one value</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[0.9rem]">
            <thead>
              <tr className="border-b-2 border-line-strong">
                <th className="py-2 pr-3">DONE, both numberings</th>
                <th className="py-2 pr-3">NOT DONE, both numberings</th>
                <th className="py-2">stored</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-dashed border-line-strong">
                <td className="py-2 pr-3">agree</td>
                <td className="py-2 pr-3">agree; every instruction is in exactly one of the two lists; at least one is done</td>
                <td className="mono py-2">{'{"mask": "11011"}'}</td>
              </tr>
              <tr>
                <td className="py-2 pr-3" colSpan={2}>
                  anything else, an unreadable answer included
                </td>
                <td className="mono py-2">{'{"mask": "unclear"}'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[0.9rem] text-ink-2">
          Every validator works out the whole value itself and compares it with the leader&apos;s by exact equality; a validator never agrees with a leader whose model call
          failed. When they do not agree, nothing is stored and nothing is charged.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Why GenLayer</h2>
        <p className="text-ink-2">
          Whether &ldquo;both bowls topped up&rdquo; carries out &ldquo;Fresh water in both bowls&rdquo; is a question about meaning, and the answer moves money. A plain smart
          contract can hold the money and count the days, but it cannot read the report. A moderator can, but a moderator works for somebody, and both sides have that day&apos;s
          rate on the answer. On GenLayer every validator reads the report against the instructions itself, and the contract pays from money it already holds, on the value they
          agreed, in the same transaction. The instructions were fixed before the money moved, so neither side can change the question after the day.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Who may do what</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[0.88rem]">
            <thead>
              <tr className="border-b-2 border-line-strong">
                <th className="py-2 pr-3">call</th>
                <th className="py-2 pr-3">who</th>
                <th className="py-2">when</th>
              </tr>
            </thead>
            <tbody>
              {WHO.map(([fn, who, when]) => (
                <tr key={fn} className="border-b border-dashed border-line-strong">
                  <td className="mono py-2 pr-3">{fn}</td>
                  <td className="py-2 pr-3">{who}</td>
                  <td className="py-2">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Where every atto goes</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-[0.88rem]">
            <tbody>
              {MONEY.map(([step, where]) => (
                <tr key={step} className="border-b border-dashed border-line-strong">
                  <td className="mono py-2 pr-3 align-top whitespace-nowrap">{step}</td>
                  <td className="py-2">{where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[0.9rem] text-ink-2">
          At 0.5 GEN a day with five instructions each line is worth 0.1 GEN: 11111 pays the sitter 0.5 GEN; 11011 pays 0.4 GEN and returns 0.1 GEN. Every settlement is one
          day of one booking, with at most two transfers.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>The limits, stated plainly</h2>
        <ul className="flex flex-col gap-2">
          {LIMITS.map(([title, body]) => (
            <li key={title} className="rounded-[12px] border-2 border-dashed border-line-strong bg-card px-3.5 py-2.5">
              <span className="font-extrabold">{title}</span> <span className="text-ink-2">{body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>The contract&apos;s own rules, read live</h2>
        <LiveRules />
      </section>
    </div>
  );
}
