# Decisions

Why each rule of `contracts/sitter.py` is the way it is, and what is verified
and what is not.

## 1. The question is fixed before the money moves

**The instructions are written once, at booking, in the owner's words.** The
sitter accepts a list it can read, and neither side can reword it after a day
has gone badly. The contract numbers the list itself, and every instruction is
one line, so an instruction cannot add a numbered line of its own. The same
instruction twice is refused. Two equal lines would give the model two numbers
for one thing, and the readings would split.

**A day is paid on what the report shows, not on a score.** The stored value
is a closed vector, one `0` or `1` per instruction, and the share follows from
it by integer arithmetic. There is no "mostly done" for the network to agree
on. Partly done is not done, and the rules say so with an example: one meal of
two.

**One action per instruction.** Each instruction is one question to the model:
was it carried out? "Feed Biscuit one scoop at 8 am and 6 pm" holds an amount
and two meals, so a report of "fed her morning and evening" leaves honest
readers to decide whether the scoop and the hours were shown, and they can
split. The demonstration, the tests and the README use one action per line,
and `rules()` publishes the rule: a combined instruction is paid only when
every part is reported. The contract cannot count the actions in an owner's
sentence, so this is a rule the owner is told, not one the door enforces.

## 2. Two framings in two numberings, one block

**DONE and NOT_DONE are mirrors.** A model that lists everything for both
questions, or nothing for both, lands on `unclear`. It never produces a mask
by agreeing with itself. NOT_DONE names the three ways an instruction goes
undone: left out, said to be skipped, too vague to tell. That makes the
question about the report, not about the sitter's character.

**The second numbering is the list reversed and renumbered.** Position bias is
invisible to consensus on its own. Every validator builds the prompt the same
way and would lean the same way. With the list reversed and renumbered, "the
first instruction" names a different instruction, so a model that answers by
position gives two different readings, and the disagreement lands in the
stored value. The mapping back (`n + 1 - k`) is in code, and the scripted
model in the tests reads the numbers each prompt shows, so a wrong mapping
fails as a disagreement.

**All four askings are inside one block.** The leader asks them in order, and
every validator asks them again itself and compares the whole mask by exact
equality. Nothing is forgiven in the comparison.

**Answers are parsed strictly.** Every asking is sent in JSON mode. The reply
must be an object whose only key is `answer`; as text, the whole reply must be
that object or a bare JSON list, at most 400 characters, with at most one
surrounding ```` ``` ```` fence removed. Nothing is searched for inside prose. An
earlier version took the first `[` to the last `]` anywhere in the reply, so
"Of instructions [1, 2, 3, 4], none were done." read as all four, and two nodes
that worded their replies differently parsed differently. Inside, a list of
distinct whole numbers from 1 to n, or the answer does not count. `"1"`, `1.0`,
`true`, `0`, n + 1, a repeat or an extra key makes the answer unreadable, and
an unreadable answer is `unclear`. The parser never guesses what a model
meant.

## 3. A vague report shows nothing done, and nothing done is unclear

**The rules say what a vague report shows.** "All fine, Biscuit is happy and
purring!" names no instruction. Without a rule, one honest reader takes it as
everything done and another as nothing done, and a reader that took it as
everything done in all four askings would produce a clean `11111` and pay the
day. So every asking carries the rule: a report that says all is well, or that
everything was done, without saying which instructions were done, shows none
of them carried out. A reader that follows the rules answers DONE `[]`.

**A reading with nothing done is unclear.** This is a guard on top of the
combine rule. Stored as `00000`, a vague report would end the day with nothing
paid and no chance to say what was actually done. So the mask needs at least
one `1`. Otherwise the reading is `unclear`: the fee goes to the owner and the
sitter may report once more.

The guard costs nothing in money. A sitter who really did nothing cannot be
paid either way. Its day stays unclear or unreported until the window ends,
and `close_day` returns the whole rate to the owner, exactly what `00000` would
have paid. The difference is timing and one fee.

**What the code cannot do.** A coherent lenient reading (DONE all, NOT_DONE
none) looks exactly like a report that named every instruction, so no check in
code can catch it. The defence is the rule in the prompt, and the test
`test_a_coherent_lenient_reader_is_paid_so_the_rule_against_it_is_in_the_prompt`
pins both halves: such a reader is paid, and every prompt carries the rule.
The README states the limit.

## 4. An unclear reading is not a free re-roll

**It costs the fee, and there is only one more try.** A report takes 0.01 GEN
from credit the sitter deposited earlier, so the round is never paid out of a
payable call. On a clear reading the fee stays in the sitter's credit. On an
unclear one it goes to the owner, so rewording until the answer suits is not
free. Two reports a day is the hard limit; a second unclear reading leaves the
day for `close_day`. A failed model call is not a reading. Nothing is stored
and no fee is taken.

## 5. The money is already there, and leaves day by day

**The whole booking is paid at booking.** `book` takes exactly
`day_rate * days` or refunds everything in the same transaction, without
raising and without asking the model. From then on the contract holds exactly
the escrow of offered and active bookings plus every credit. The random
journeys check this after every step.

**One day, one exit.** `_settle_day` is the only place a day's rate leaves. It
pays the sitter's share, rounded down, and the owner the rest. A paid day and
a closed day both go through it, and the booking finishes when its last day is
settled. Every settlement is O(1): a booking of fourteen days settles in
fourteen separate calls, never in a loop.

**Ending early refunds only what has not begun.** The owner who comes home on
day two gets day three back at once. Day two stays reportable, because the
sitter may already have done the work. The refund is one transfer of
`(last_day - begun) * day_rate`.

## 6. Every party has a way out

| refused | the way out |
|---|---|
| an owner sent the wrong amount | send exactly `day_rate * days` |
| a sitter who never accepts | `withdraw_booking`, at any time while the offer stands |
| a sitter too late to accept | the owner withdraws, or the sitter declines |
| a report without credit | `deposit`, then report |
| a report before the day opens | the refusal says when it opens |
| a report judged unclear | report once more, in plain words |
| a report after the window | anyone closes the day; the rate goes back to the owner |
| a sitter who never reports | `close_day`, one day at a time |
| an owner who comes home early | `end` |
| a sitter who wants to stop | stop reporting; each day closes back to the owner |
| credit left over | `withdraw` |

Each is walked as a journey in `TestRoutesOut`. The random journeys end by
bringing every booking still running to a close through a party's own call,
and every credit back to its owner.

## What is verified, and what is not

Verified offline: every rule and refusal above, at each boundary (the lead,
the first instant of a window, the last second before it closes, the credit
exactly equal to the fee); each mask and its exact split, including integer
rounding with an odd rate; the vague report, the report that shows nothing,
two unclear readings and the re-report; the reversed numbering mapped back;
the numberings or the framings disagreeing landing on `unclear`; replies in
prose, with extra keys, past 400 characters or fenced twice being unreadable,
and a reply in one fence being read; a coherent lenient reader of the vague
report being paid, with the rule against it in every prompt; a failed
model call, a dishonest leader and a failing validator each storing nothing or
being outvoted; `close_day` for an unreported and an unclear day; `end` before
the first day, mid-booking and at the first instant of a day; the day view
through every state; money invariants after every step of sixteen seeded
random journeys that must reach every status and every day outcome; static
rules over the parsed source (sender gates, the payable doors, loops, the
prompt boundary, the closure, the comparison, no float, every JSON read, every
transfer); and 259 mutants, none surviving.

Not verified offline: how real models on Studio read the demo reports. The
scripted reader in the tests is a stand-in. The on-chain run is the evidence
for that, and its record goes in the README once it has run.
