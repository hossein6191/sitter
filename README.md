# Sitter

Pet and house sitting paid day by day: the owner's care instructions are fixed
up front, each day's report is read by validators against every instruction,
and that day's pay is released only for the instructions the report shows
done.

## The problem

A pet sitter is paid up front or at the end, and either way the owner pays for
days nobody else saw. The sitter who forgot the evening pill twice is paid the
same as the one who did everything on the list. The owner's only leverage is
to refuse the whole payment, and then it is one person's word against
another's, about a whole week, after the fact.

What both sides actually have is a list and a message a day. The owner wrote
"Give Biscuit her heart pill" before leaving, and the sitter wrote "fed her
morning and evening, fresh water, ferns watered, forgot the pill, sorry" that
evening. Whether that message shows each instruction done is a
question about meaning, and the answer decides money. A booking platform
answers it with a moderator who works for the platform. A plain smart contract
can hold the money and count the days, but it cannot read the message.

## What it is

The owner **books** a sitter and pays for every day at once:

- one to six numbered care instructions, in the owner's own words, 10 to 150
  characters each, one action per instruction ("Feed Biscuit her evening
  meal"). A combined instruction ("feed her at 8 and at 6") is paid only when
  the report shows every part done, so each meal, each pill and each chore
  goes on its own line;
- a day rate from 0.05 to 20 GEN and 1 to 14 days;
- a day length from 600 seconds to a full day (a demonstration can use short
  days), and a start from five minutes to 90 days ahead.

The owner sends exactly `day_rate * days`, and the contract holds it. The
sitter **accepts** before the first day starts, or **declines**; an offer
nobody accepted can always be **withdrawn** by the owner.

Every day has a report window: from the start of that day until 30 minutes
after its end. The sitter **reports** on the day in plain words. A report
costs a fee of 0.01 GEN from credit the sitter **deposited** beforehand. The
network reads the report against every instruction and agrees on a done-mask,
one character per instruction: `11011` means the third instruction was not
shown done. That day's money moves in the same transaction:

- The sitter gets `day_rate * done // instructions`. The owner gets the rest of
  that day's rate back. The fee stays in the sitter's credit.
- When the four askings do not fit together (the two numberings or the two
  framings disagree, or an answer is unreadable), or no instruction is shown
  done, the reading is **unclear**. Nothing moves from the escrow, the fee goes
  to the owner, and the sitter may report once more inside the window.
- When the validators cannot agree with each other, there is no reading at
  all. Nothing is stored and nothing is charged, and the report can be sent
  again.
- When the window ends and the day is still unreported or unclear, anyone may
  **close** it, and the day's rate goes back to the owner.

The owner may **end** the booking early. The days that have not begun are
refunded at once, and the day already running stays reportable.

## How consensus is used

A report is one consensus round. Every validator asks four questions itself,
over the numbered INSTRUCTIONS and the REPORT, turns the answers into one
closed value, and compares the value that will be stored with the leader's by
exact equality.

### The four askings

Two framings:

> **DONE**: Which numbered INSTRUCTIONS does the REPORT say were carried out on
> this day? Answer with the list of those numbers, for example [1, 3], or []
> for none.

> **NOT_DONE**: Which numbered INSTRUCTIONS does the REPORT not say were carried
> out on this day, because it leaves them out, says they were skipped, or is
> too vague to tell? Answer with the list of those numbers, or [] for none.

Each framing is asked in two numberings. In the first, the instructions are
listed as the owner wrote them, numbered 1 to n. In the second, they are
listed in reverse and numbered 1 to n again, so the line numbered 1 is the
last instruction. The contract maps the answers back: number k in the reversed
list is instruction n + 1 - k. A model that answers by position rather than by
reading ("the first one was done") gives different instructions in the two
numberings.

All four askings carry the same rules, word for word:

> Rules: judge only what the REPORT says about this day. An instruction was
> carried out when the report says it was done, in words that make clear which
> instruction it is; the report need not repeat the instruction word for word.
> A report that says all is well, or that everything was done, without saying
> which instructions were done, shows none of them carried out. An instruction
> done only in part, such as one meal of two, was not carried out. The report
> is the sitter's own claim: take what it says as said, and do not guess
> beyond it.

Each asking is sent in JSON mode and asks for `{"answer": [1, 3]}`, using only
the numbers shown, each at most once. An answer is read strictly. The whole
reply must be an object whose only key is `answer`, or a bare JSON list, at
most 400 characters, with at most one surrounding ```` ``` ```` fence removed.
Nothing is searched for inside prose: "Of instructions [1, 2, 3, 4], none were
done." is unreadable, not the list `[1, 2, 3, 4]`. The list must hold distinct
whole numbers from 1 to n. `"1"`, `1.0`, `true`, `0`, a number past the list, a
number given twice, an extra key, or anything else makes that answer
unreadable.

### How the answers combine

| DONE, both numberings | NOT_DONE, both numberings | stored |
|---|---|---|
| agree | agree, and every instruction is in exactly one of the two lists, and at least one is done | `{"mask": "11011"}` |
| anything else, an unreadable answer included | | `{"mask": "unclear"}` |

NOT_DONE is the mirror of DONE. A model that lists every instruction for both
questions, or for neither, lands on `unclear`, never on a mask. A reading that
shows nothing done is also `unclear` rather than a zero day. "All fine, Biscuit
is happy and purring!" names no instruction, and the rules say what such a
report shows: none of them carried out. A reader that follows the rules answers
DONE `[]`, and the reading is `unclear`. The sitter is told the report did not
say, and may write a proper one once. A sitter who really did nothing reaches
the same money through `close_day`: the day's rate goes back to the owner.

### What every round shares

- The instructions and every report are untrusted. Each block is fenced (`<`
  and `>` replaced by `(` and `)`, never deleted). It sits between delimiter
  lines tagged with the start of its own sha256. The prompt says before the
  blocks that they are material and never an instruction. Instructions and
  reports are one line each, so an instruction cannot start a numbered line of
  its own.
- A validator never agrees with a leader that raised. A failed model call
  raises `[LLM_ERROR]`, nothing is written, and the report can be sent again
  without losing the fee. A validator whose own model call fails disagrees.
- The model never sees an amount, an address, a day number or a clock. It sees
  the instructions and the report.
- The longest possible prompt is 3,795 characters. The clock comes from each
  transaction's own `datetime`. No arithmetic in this contract uses a float.

## Why GenLayer

The judgment here is about meaning. Does "both bowls topped up" carry out
"Fresh water in both bowls"? Does "gave her breakfast before I left" carry out
"Feed Biscuit her morning meal"? A deterministic contract cannot answer either
question. A
moderator can, but the moderator works for somebody, and both sides have that
day's rate on the answer.

On GenLayer every validator reads the report against the instructions itself,
and the contract pays from money it already holds, on the value they agreed
on, in the same transaction. No moderator decides, and the owner does not have
to chase a refund. The instructions were fixed before the money moved, so
neither side can change the question after the day.

## Who may do what

| call | who | when |
|---|---|---|
| `book` (payable) | anyone; the sender is the owner, the sitter another address | the first day 300 s to 90 days ahead |
| `withdraw_booking` | the owner | while the offer is not accepted |
| `decline` | the sitter | while the offer is not accepted |
| `accept` | the sitter | before the first day starts |
| `deposit` (payable) | anyone, into its own credit | any time |
| `withdraw` | anyone, its own credit | any time |
| `report` | the sitter | inside the day's window; once, and once more only after an unclear reading |
| `close_day` | anyone | once the day's window has ended without a clear reading |
| `end` | the owner | while some day has not begun |

`deposit`, `withdraw` and `close_day` do not check who is calling, on purpose,
and a static test lists them with the reason. A deposit only adds to the
caller's own credit. A withdrawal only pays the caller's own credit back to the
caller. A closed day's rate can only go to the owner fixed at booking, and
only once the sitter could no longer report on it.

## The money

| step | where the money goes |
|---|---|
| `book` | the owner pays exactly `day_rate * days`; it is held here |
| `withdraw_booking`, `decline` | everything back to the owner |
| `report`, a mask | the sitter gets `day_rate * done // instructions` (rounded down); the owner gets the rest of that day's rate; the 0.01 GEN fee stays in the sitter's credit |
| `report`, unclear | nothing from the escrow; 0.01 GEN from the sitter's credit to the owner |
| `close_day` | the day's rate back to the owner |
| `end` | `day_rate` for every day not yet begun back to the owner |
| `deposit` / `withdraw` | the caller's own credit, in and out |
| a refused `book` or `deposit` | everything sent comes back in the same transaction, with `{"ok": false}` |

The contract always holds exactly the escrow of the offered and active
bookings plus every credit. Every settlement is O(1): one day, one booking,
at most two transfers.

At 0.5 GEN a day with five instructions, each instruction is worth 0.1 GEN:
`11111` pays the sitter 0.5 GEN; `11011` pays 0.4 GEN and returns 0.1 GEN;
`00001` pays 0.1 GEN and returns 0.4 GEN. With three instructions the share is
rounded down to the atto, and the owner keeps the odd atto.

## The demonstration

Biscuit is a cat. Her owner books a sitter for three short days of 1200
seconds at 0.5 GEN a day, with five instructions of one action each:

1. Feed Biscuit her morning meal
2. Feed Biscuit her evening meal
3. Give Biscuit her heart pill
4. Fresh water in both bowls
5. Water the balcony ferns

| day | report | reading | money |
|---|---|---|---|
| 1 | "Fed Biscuit her morning meal and her evening meal, gave her the heart pill, put fresh water in both bowls and watered the balcony ferns." | `11111` | 0.5 GEN to the sitter |
| 2 | "Fed Biscuit her morning meal and her evening meal, fresh water in both bowls, and the balcony ferns are watered. I forgot her heart pill, sorry." | `11011` | 0.4 GEN to the sitter, 0.1 GEN back to the owner |
| 3 | "All fine, Biscuit is happy and purring!" | unclear | 0.01 GEN fee to the owner |
| 3 | the one re-report, every instruction named | `11111` | 0.5 GEN to the sitter; the booking is finished |

A second booking of one day at 0.1 GEN is accepted and never reported. Once its
window ends, a stranger closes the day and the 0.1 GEN goes back to the owner.

## The limits, stated plainly

- **The report is the sitter's claim, not a fact.** The network reads words. It
  never sees the cat, the bowls or the ferns. A sitter who writes "gave the
  pill" without giving it is paid for it. What the owner gets is a record, on
  chain for good and signed by the sitter's address, of exactly what the
  sitter claimed on each day. That is evidence for whatever comes next, not a
  camera.
- **Images are not read.** A report is text only, printable ASCII on one line,
  30 to 900 characters. Letters outside ASCII are refused.
- **Every instruction weighs the same.** The day rate is split evenly across
  the instructions, so "the pill" and "the ferns" are worth the same. The
  same instruction twice is refused.
- **One action per instruction.** Partly done is not done: one meal of two
  does not carry out "feed her at 8 am and 6 pm". A combined instruction is
  paid only when every part is reported, so an owner who wants each part paid
  writes each part as its own instruction.
- **A vague report costs the fee.** So does a report that shows nothing done.
  The second report on a day is the last; after that the day waits for its
  window to end and goes back to the owner.
- **The rule against vague reports is words the model reads.** The code cannot
  tell "all fine" read as everything done from a report that names every
  instruction: both come back as DONE all and NOT_DONE none. What stops it is
  the rule every asking carries. A model that ignored that rule in all four
  askings, on most validators, would pay the day.
- **Models can disagree.** A report that honest validators read differently gets
  no consensus. Nothing is stored and nothing is charged, and the sitter sends
  it again or rewrites it.
- **Days are windows, not calendar days.** Day d runs from
  `start_at + (d - 1) * day_seconds` for `day_seconds`, plus 30 minutes for
  the report. There are no time zones and no calendar.
- **Only the owner can end early.** A sitter who stops simply stops reporting,
  and each day goes back to the owner when its window ends.
- **Not audited.** It runs on GenLayer Studio, a test network.

## What is in this repository

```
contracts/sitter.py          the contract
tests/test_pure.py           the offline suite, including the consensus round with a world per node
tests/MUTATIONS.md           every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs     a throwaway-account run against Studio
tools/mutate.py              the generator that writes MUTATIONS.md and refuses to if anything survives
docs/CONTRACTS.md            purpose, consensus, state, methods, loops and limits
docs/DECISIONS.md            why each rule is the way it is, and what is verified and what is not
web/                         the site: a Next.js app with its own tests (see "The site")
```

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                       # no network, no Studio
genvm-lint check contracts/sitter.py
python tools/mutate.py                 # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

On this repository as it stands, `pytest tests/ -q` gives **124 passed** in
under a second. `genvm-lint check` (genvm-linter 0.11.0) prints
`Lint passed (3 checks)` and reports 16 methods, 7 view and 9 write.
`python tools/mutate.py` removes or inverts **259 defences** one at a time,
and **none survives**.

The on-chain run uses three throwaway keys it generates itself (OWNER, SITTER,
STRANGER) and funds them from the Studio faucet. It never touches anybody's
own wallet, and no page has to be published first: the validators read only
the instructions and the reports.

```
npm ci
node tests/on_chain/smoke.mjs                # about an hour and a quarter
RESUME=1 node tests/on_chain/smoke.mjs       # continue from the saved state
```

It deploys its own copy, books Biscuit's three days and the one-day variant,
and waits on the chain's own clock for each day to open. Along the way the
owner's attempt to book itself is refused and refunded in the same
transaction. A stranger's acceptance, a stranger's report, a report on a day
that has not opened and an early `close_day` are all refused. At the end it
compares the deployed code with `contracts/sitter.py` byte for byte, checks
the views, and checks that every account ends where the money says. It prints
a PASS or FAIL line for every check, the balances before and after every step
that moves money, `N passed, M failed`, and the contract address.

## The site

`web/` is the dApp: a Next.js 16 site that looks like a sitter's diary. A cream
ruled notebook page with a spiral binding lies on a sage-green desk. Each day of
a booking is a square in a week planner that fills with the sitter's report and
gets a round sticker: a green paw for all done, amber for part done, grey for
unclear with a re-report left. Each care instruction is a checkbox line that
ticks itself from the agreed mask, and each day's money is a small envelope,
either paid to the sitter or back to the owner.

| page | what it is for |
|---|---|
| `/` | the promise in one minute, how the money moves, and where to start |
| `/book` | book the demo sitter with one of its three care plans, or any address with a list of your own: the days, the day length, the start and the rate, each with suggestions |
| `/booking/[id]` | the diary: the instructions, a square for every day with its window counting down, its report, its sticker and its envelopes, the demo sitter's report buttons, and accept, decline, withdraw, end early and close a day |
| `/mine` | every booking of the connected address, as owner and as sitter |
| `/sitting` | for sitters: offers to answer, every day open for a report with the report form and its suggestions, and the credit for report fees |
| `/ledger` | the contract's totals from `stats()`, a booking by id, and the newest bookings |
| `/how` | the four askings word for word, why GenLayer, who may do what, where every atto goes, the limits, and `rules()` read live |

Every moment of waiting gets one note that says what is happening, how long it
takes, whether anything is needed from you, whether you can leave, and where
the money is. Those notes cover the wallet prompt, a transaction on its way, a
report being read, an offer waiting for the sitter, a day open for its report,
an unclear reading and its re-report window, and a day or a booking that has
settled. The words live in `web/lib/guide.ts`, written for the owner, the
sitter and anyone else.

**The demo sitter.** So that one visitor's wallet can try everything as the
owner, the site's server holds a throwaway Studio key in `DEMO_SITTER_KEY`.
That key is the demo sitter. It accepts a booking made to it when the
instructions are one of three demo care plans word for word: Biscuit the cat,
Pepper the dog, or the house on Juniper Lane. When the visitor presses one of
its buttons, it files one report from a fixed list for that plan: everything
done, one missed, a vague note (read as unclear) or two missed. The button sends
only the booking, the report's key and the day, and the words signed are the
plan's own. Nothing the visitor types ever passes through it. The visitor books
with days of ten minutes, so a whole booking fits in one sitting.

| route | what it does |
|---|---|
| `GET /api/demo/status` | whether the demo sitter can act, its address, how many report fees its credit holds, and exactly why not |
| `POST /api/demo/accept` `{booking}` | `accept()` on a booking made to it with a demo plan, before day 1 |
| `POST /api/demo/report` `{booking, script, day?}` | `report()` with one of the plan's four fixed reports (`all`, `one`, `vague`, `two`) on the day asked for, or else the day running now |

The demo sitter tops up its own credit with `deposit()` when it runs low. The
key is never logged or returned. `web/tools/open-demo-sitter.mjs` checks the key,
funds the account from the faucet and deposits its first credit;
`DRY=1` only checks the key and the plans.

```
cd web
npm ci
NEXT_PUBLIC_MOCK=1 node tools/dev.mjs     # the whole site on an in-memory copy of the contract, port 3240
npm run test:site                          # 39 tests, no network
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint
./node_modules/.bin/next build
```

In mock mode (`NEXT_PUBLIC_MOCK=1`), `web/lib/chain-mock.ts` stands in for the
contract. It follows every check, refusal sentence, window and transfer of
`contracts/sitter.py`, and it lets you act as one of five demo accounts and move
the clock on. It cannot ask a model, so it reads the demo sitter's fixed reports
and the sitting page's suggested reports as they are written to be read. Any
other report lands unclear there.

The site's tests read `contracts/sitter.py` itself. They check that every call
names a real method with its arguments and its value, that every view is read,
that the limits, the askings and the refusal sentences are the contract's own,
that the argument readers and `rules()` answer exactly as the Python does, and
that the money stays whole across 400 seeded random steps. They also check
every reading of every demo plan, the waiting words for every state and role,
that every suggestion is inside the limits, and that nothing personal is in the
files.

To deploy it on Vercel, set the Root Directory to `web` and set
`DEMO_SITTER_KEY` (a throwaway Studio key). Point the site at the deployed
contract with `NEXT_PUBLIC_CONTRACT` or `DEMO_CONTRACT` in `web/lib/config.ts`.
The Source link comes from `NEXT_PUBLIC_REPO_URL` or Vercel's own git variables.
`web/.env.example` lists every setting.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. The contract pins the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in its first
line.

## Evidence

Run on 19 October 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, from generated accounts funded from the
Studio faucet, none of them anybody's wallet: **OWNER** books, **SITTER** accepts and reports, **STRANGER** tries what it may not. **26 passed, 0 failed**; transactions: 18 in 18 steps; sent a second time: none.
The whole log is `tests/on_chain/smoke-run.log`. Biscuit's five instructions were read against each day's report: day 1 all done (11111, the whole 0.5 GEN to the sitter), day 2 with the pill forgotten (11011, 0.4 GEN to the sitter and 0.1 GEN back), day 3 "All fine, Biscuit is happy and purring!" unclear (the fee to the owner) and then a re-report read 11111; a day nobody reported on was closed and its 0.1 GEN went back to the owner.

- `sitter.py` deployed at [`0x041E4c71127826c0a0D84164CAE86D4d0202AAa1`](https://explorer-studio.genlayer.com/address/0x041E4c71127826c0a0D84164CAE86D4d0202AAa1)

- the code deployed at 0x041E4c71127826c0a0D84164CAE86D4d0202AAa1 is byte for byte contracts/sitter.py: 61709 bytes, sha256 4bebbb7b96508a8180e8c8d9ff397fab78409b84680650133f6cd698dfd130b4

| step | by | transactions | votes |
|---|---|---|---|
| OWNER books SITTER for Biscuit: five instructions, 0.5 GEN a day, three days of 1200 s, 1.5 GEN held | OWNER | [0xaf734323…](https://explorer-studio.genlayer.com/tx/0xaf734323969a73ac2617d0c66b47cfceb58c9e6f64b4337c03dcc91687fca4d9), [0x66f8e526…](https://explorer-studio.genlayer.com/tx/0x66f8e526b892a95ac4f376a75e5b4db1d0e84db222af965e7a416a7be9d94964) | 3 agree, 0 disagree, 2 idle |
| OWNER books B2, the variant nobody reports: one day of 600 s at 0.1 GEN | OWNER | [0x73a18fab…](https://explorer-studio.genlayer.com/tx/0x73a18fab95c4b93b62e5e619f5f95c06b2e439ae61513831838dc5611f7e55bd) | 3 agree, 0 disagree, 2 idle |
| SITTER accepts B1 before its first day | SITTER | [0x469e6a34…](https://explorer-studio.genlayer.com/tx/0x469e6a34318226f143e81319d85ad2de88ca86755514f682c2a03c88749e3335) | 3 agree, 0 disagree, 2 idle |
| SITTER accepts B2 | SITTER | [0x2fcce487…](https://explorer-studio.genlayer.com/tx/0x2fcce487d21bba820333bd9ce2c8ff8157ecefd87a10c1d540d64a8b7efdf9fb) | 3 agree, 0 disagree, 2 idle |
| STRANGER may not accept B1 | STRANGER | [0xf2c379ee…](https://explorer-studio.genlayer.com/tx/0xf2c379ee01a004b3f572ee469a456a396ca601a30d034a4061eaebd433883d11) | 3 agree, 0 disagree, 2 idle |
| OWNER may not book itself as the sitter, and the 1.5 GEN comes back in the same transaction | OWNER | [0x5b8cc19c…](https://explorer-studio.genlayer.com/tx/0x5b8cc19c6427c9bfe697f60c27ea6e6e604e9f5fd3fc9129a8e6436604370d31) | 3 agree, 0 disagree, 2 idle |
| SITTER deposits 0.05 GEN of credit, five report fees | SITTER | [0x8ba68a5a…](https://explorer-studio.genlayer.com/tx/0x8ba68a5af63869bd8266188946ae6098eb215d4caaf6ca26079d7efbe4aae235) | 5 agree, 0 disagree, 0 idle |
| STRANGER may not report on B1 | STRANGER | [0xa3439b96…](https://explorer-studio.genlayer.com/tx/0xa3439b96a469064977c75e6cec56fc5cdae69d17ec12edb0cea02e4e53dcd7de) | 3 agree, 0 disagree, 2 idle |
| SITTER may not report on day 3 of B1 yet: its window is not open | SITTER | [0x1b9b1115…](https://explorer-studio.genlayer.com/tx/0x1b9b11157c42ab9fec4a990a04ad0a7e172f95ad82501a5013daaa991b19fce8) | 5 agree, 0 disagree, 0 idle |
| STRANGER may not close day 1 of B2 yet: its window has not ended | STRANGER | [0xf3433f32…](https://explorer-studio.genlayer.com/tx/0xf3433f32a0e32c0015f5557d912ae0d3e4046ecf2a61efed11ce358268a2c171) | 3 agree, 0 disagree, 2 idle |
| the day 1 report covers every instruction: 11111, the whole 0.5 GEN to SITTER | SITTER | [0x42cbed1d…](https://explorer-studio.genlayer.com/tx/0x42cbed1ded3e215a234ac374be343416d56259dad0e79cdbd65627ef65c55dd6) | 3 agree, 0 disagree, 2 idle |
| the day 2 report says the pill was forgotten: 11011, 0.4 GEN to SITTER and 0.1 back to OWNER | SITTER | [0xabe766a1…](https://explorer-studio.genlayer.com/tx/0xabe766a17c70642d0aeaa159bfb4e3280ec4b9d2bac091f7185f66c6927a8a44) | 3 agree, 0 disagree, 2 idle |
| "All fine, Biscuit is happy and purring!": unclear, nothing paid from the escrow, the 0.01 GEN fee to OWNER from SITTER's credit | SITTER | [0x1c4ea402…](https://explorer-studio.genlayer.com/tx/0x1c4ea40272b3dd53f2c9bc9305917598a98515eac9c9a3984ce75cec856eca6c) | 3 agree, 0 disagree, 2 idle |
| the one re-report on day 3 covers every instruction: 11111, 0.5 GEN to SITTER, and B1 is finished | SITTER | [0xcb8fb410…](https://explorer-studio.genlayer.com/tx/0xcb8fb410ef6bd4554152b4e06b1c9658654f8006dbdd95ca882fbfd93b268b76) | 3 agree, 0 disagree, 2 idle |
| a further report on day 3 of B1 is refused | SITTER | [0x2a9798a9…](https://explorer-studio.genlayer.com/tx/0x2a9798a920d64bbbef01c80677d82bc607de2aaff7f398903700b3400a7c98e4) | 3 agree, 0 disagree, 2 idle |
| nobody reported on B2: once its window ends STRANGER closes the day and the 0.1 GEN goes back to OWNER | STRANGER | [0x4d5b0039…](https://explorer-studio.genlayer.com/tx/0x4d5b003991e99981184843cc6de1e222be712bb0137a9bef652db5ac1fba3eda) | 3 agree, 0 disagree, 2 idle |
| SITTER withdraws the credit left: 0.04 GEN back | SITTER | [0xed3febed…](https://explorer-studio.genlayer.com/tx/0xed3febed154e23c501507a1dae762284ff39af51433e3a74d656c3e950551797) | 5 agree, 0 disagree, 0 idle |

## Licence

MIT. See `LICENSE`.
