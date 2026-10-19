# Contracts

One file, `contracts/sitter.py`. It is the only thing in this repository that
asks the network anything.

## contracts/sitter.py

### Purpose

Escrow for pet and house sitting, released day by day. The owner books a
sitter with one to six numbered care instructions, a day rate and a number of
days, and pays for every day at once. Each day the sitter files one report.
The network reads it against every instruction and agrees which ones it shows
done. That day's rate is split in the same transaction: the sitter's share for
the instructions shown done, and the rest back to the owner.

### Consensus

One kind of round: `report`, one `gl.vm.run_nondet_unsafe(leader_fn,
validator_fn)` block with all its work inside the leader closure. The
validator closure is always `return _agrees(leaders_res, leader_fn)`. It
refuses a leader that raised or returned anything but a dict, runs the
leader's work itself inside `try/except` (its own failure is a disagreement),
and compares the whole value by exact equality.

Inputs: the booking's instructions, as the owner wrote them, and the report.
Nothing else reaches the prompt: no amount, no address, no day number, no
clock.

Four askings, in this order:

| # | numbering | question |
|---|---|---|
| 1 | listed, 1 to n | DONE |
| 2 | reversed, renumbered 1 to n | DONE |
| 3 | listed | NOT_DONE |
| 4 | reversed, renumbered | NOT_DONE |

> DONE: Which numbered INSTRUCTIONS does the REPORT say were carried out on this
> day? Answer with the list of those numbers, for example [1, 3], or [] for
> none.

> NOT_DONE: Which numbered INSTRUCTIONS does the REPORT not say were carried out
> on this day, because it leaves them out, says they were skipped, or is too
> vague to tell? Answer with the list of those numbers, or [] for none.

Each prompt is: the header; the untrusted warning; the INSTRUCTIONS block (one
numbered line per instruction) and the REPORT block, each fenced, capped and
tagged with the start of its own sha256; the rules; the question; and the
answer shape `{"answer": [1, 3]}`. The rules and the warning are published
word for word by `rules()`. The rules include that a report saying all is well
without saying which instructions were done shows none of them carried out.
Every asking is sent with `response_format="json"`.

Reading an answer (`_answer_value`, then `_read_numbers`): a JSON object whose
only key is `answer`, or, as text, the whole reply, at most 400 characters with
at most one surrounding ```` ``` ```` fence removed, being that object or a bare
JSON list. Nothing is searched for inside prose. The value must be a list of
distinct whole numbers from 1 to n, or the answer is unreadable (`None`). A
fraction is read as text, so it is never a number. A reversed answer is mapped
back by `_from_reversed`: k becomes n + 1 - k.

Combining (`_combine_mask`): a mask only when no answer is unreadable, both
DONE answers are equal, both NOT_DONE answers are equal, at least one
instruction is done, and every instruction is in exactly one of the two lists.
The mask has one character per instruction in the listed order: `1` shown
done, `0` not. Anything else is `unclear`. Stored and compared:
`{"mask": "1011"}` or `{"mask": "unclear"}`. `_clean_mask` reads the agreed
value back and turns anything that is not n characters of `0` and `1` with at
least one `1` into `unclear`.

### State

| map | key | holds |
|---|---|---|
| `booking_rows` | `B1`, `B2`, ... | `Booking`: parties, terms, status, `last_day`, `settled`, `held`, the money paid out, counters |
| `instruction_rows` | `B1:1` ... `B1:6` | the instructions, as the owner wrote them |
| `day_rows` | `B1#1`, ... | `Day`: only for a day that was reported or closed; status, both reports and their readings, the paid mask, the split |
| `credit_rows` | lowercase address | credit for report fees |
| `index`, `counts` | `party:<address>` | each address's bookings, as numbered slots |

Both storage dataclasses hold scalars only. Totals (`held_total`,
`credit_total`, `to_sitters`, `to_owners`, `fees_to_owners`, `returned`) and
status counters live on the contract.

### Days and windows

Day d (1 to `days`) has the report window
`[start_at + (d - 1) * day_seconds, start_at + d * day_seconds + REPORT_GRACE)`,
with `REPORT_GRACE` = 1800 seconds. The windows of neighbouring days overlap
by the grace. A day with no `Day` row has not been reported. The `day` view
places it on the clock as `upcoming`, `open` or `closable`. A stored day is
`unclear`, `paid` or `closed`. A day cut by `end` is `ended`, and the days of
a declined or withdrawn offer are `void`.

### Methods

Writes: `book` (payable), `withdraw_booking`, `decline`, `accept`, `deposit`
(payable), `withdraw`, `report`, `close_day`, `end`. Views: `booking`, `day`,
`days_of`, `bookings_of`, `credit`, `stats`, `rules`.

Six writes compare the sender with a party and refuse: the owner for
`withdraw_booking` and `end`; the sitter for `decline`, `accept` and `report`;
anyone but the sitter named in it for `book` (the owner may not book itself).
`deposit`, `withdraw` and `close_day` refuse nobody by sender. Each says "Open
on purpose" in its docstring and is listed with its reason in the static test.

`book` and `deposit` never raise and never reach the model. Every refusal goes
through `_refuse`, which sends the value back and answers `{"ok": false}`.

`report` checks everything before the round, and writes nothing before it:
the sitter, an active booking, the day, its window, the day's state and tries,
the text, the clock and the credit. A round that does not settle leaves no
trace.

`_settle_day` is the single exit of a day's rate. It pays the sitter
`min(max(share, 0), day_rate)` and the owner the rest, marks the day, and
finishes the booking when every day still part of it is settled. `end` and
`_close_offer` each send one refund to the owner. Every settlement is O(1).

### Loops

Every loop is bounded by a named constant, and a static test lists each one:
the instructions (`MAX_INSTRUCTIONS`, in `_instructions_of`, `book`,
`_numbered`, `_read_numbers`, `_from_reversed`, `_combine_mask` and
`_instructions`) and every list page (`PAGE`, in `_page` and `days_of`;
`bookings_of` walks one page). There is no `while`. The instructions JSON is
cut at 2,000 characters before it is parsed, and a model's answer at 400.

### Errors

| class | when | stored |
|---|---|---|
| `[EXPECTED]` | a rule of this contract, raised by a write that took no value | nothing |
| `[LLM_ERROR]` | a model call failed | nothing; the fee is not taken |
| `{"ok": false}` | a refused `book` or `deposit`; everything sent goes back | the refusal is counted |

### Limits

One to six instructions, 10 to 150 characters each, all different (case
ignored), sent as a JSON list of at most 2,000 characters. One action per
instruction is the published rule, not a check: a combined instruction is paid
only when every part is reported. Day rate 0.05 to 20
GEN. One to 14 days of 600 to 86,400 seconds. The first day starts 300 seconds
to 90 days after the booking. Reports are 30 to 900 characters; instructions
and reports are printable ASCII on one line. Two reports a day at most, the
second only after an unclear reading. The report fee is 0.01 GEN, and the
grace after a day is 1,800 seconds. List views return at most 20 rows. See the
README for the plain-language list.
