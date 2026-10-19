"""Remove each defence of Sitter in turn, and record the test that killed it.

    python tools/mutate.py                 # writes tests/MUTATIONS.md; exit 1 if any mutant survives
    python tools/mutate.py --jobs 8        # run eight mutants at a time (default: the number of CPUs)
    python tools/mutate.py --only fence    # run only the mutants whose name contains "fence"; writes nothing

A passing count is a claim; this table is the evidence. Each mutant is written
to its own file (never over the source) and the suite runs against it with
bytecode caching off, so a stale .pyc can never attribute a kill to the wrong
code. The harness refuses to run over a failing baseline, refuses an anchor
that is not found exactly once, and treats a mutant that does not even import
as a broken anchor, never as a kill. A mutation is (name, before, after), or
(name, [(before, after), ...]) when moving a defence takes two edits.
"""
import argparse
import concurrent.futures
import os
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT / "contracts" / "sitter.py").read_text(encoding="utf-8")
PYTEST = [sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider",
          str(ROOT / "tests" / "test_pure.py")]

# against contracts/sitter.py
MUTATIONS = [
    # --- the prompt boundary
    ("the fence does nothing",
     'return str(raw).replace("<", "(").replace(">", ")")', 'return str(raw)'),
    ("the fence deletes instead of replacing",
     'return str(raw).replace("<", "(").replace(">", ")")', 'return str(raw).replace("<", "").replace(">", "")'),
    ("the fence only replaces the opening bracket",
     'return str(raw).replace("<", "(").replace(">", ")")', 'return str(raw).replace("<", "(")'),
    ("the delimiters carry a fixed tag", '    tag = _tag(body)\n', '    tag = "0123456789abcdef"\n'),
    ("a closing line carries another tag",
     '"\\n<<<END " + name + " " + tag + ">>>"', '"\\n<<<END " + name + " " + _tag(name) + ">>>"'),
    ("any label reaches a delimiter line",
     'name = label if label in LABELS else LABEL_FALLBACK', 'name = label'),
    ("a block is not capped", 'body = _fence(text)[:_cap(name)]', 'body = _fence(text)'),
    ("a block is capped but not fenced", 'body = _fence(text)[:_cap(name)]', 'body = str(text)[:_cap(name)]'),
    ("the list is capped like a report",
     '    if name == LABEL_INSTRUCTIONS:\n        return MAX_LIST', '    if False:\n        return MAX_LIST'),
    ("the list cap forgets the numbers",
     'MAX_LINE = len(str(MAX_INSTRUCTIONS)) + 2 + MAX_INSTRUCTION ', 'MAX_LINE = MAX_INSTRUCTION '),
    ("the list cap forgets the newlines",
     'MAX_LIST = MAX_INSTRUCTIONS * (MAX_LINE + 1) ', 'MAX_LIST = MAX_INSTRUCTIONS * MAX_LINE '),
    ("the reversed numbering is the listed one",
     '    if order == REVERSED:\n        shown.reverse()', '    if False:\n        shown.reverse()'),
    ("the list is numbered from 0", 'str(k + 1) + ". " + shown[k]', 'str(k) + ". " + shown[k]'),
    ("the caller's list is reversed in place", 'shown = list(items[:MAX_INSTRUCTIONS])', 'shown = items'),
    ("the report comes before the list",
     '    return first + "\\n\\n" + second\n', '    return second + "\\n\\n" + first\n'),
    ("DONE is asked in one numbering only",
     'exec_prompt(_done_task(items, report, REVERSED)', 'exec_prompt(_done_task(items, report, LISTED)'),
    ("NOT_DONE is asked in one numbering only",
     '_not_done_task(items, report, REVERSED)', '_not_done_task(items, report, LISTED)'),
    ("NOT_DONE asks the DONE question",
     'return _task(items, report, order, QUESTION_NOT_DONE)', 'return _task(items, report, order, QUESTION_DONE)'),
    ("DONE asks the NOT_DONE question",
     'return _task(items, report, order, QUESTION_DONE)', 'return _task(items, report, order, QUESTION_NOT_DONE)'),
    ("DONE gives no example of the answer",
     '"numbers, for example [1, 3], or [] for none."', '"numbers."'),
    ("NOT_DONE forgets what is left out", 'because it leaves them out, "', 'because it "'),
    ("NOT_DONE forgets the skipped", '"says they were skipped, or is too vague to tell?', '"is too vague to tell?'),
    ("NOT_DONE forgets the vague", 'says they were skipped, or is too vague to tell?', 'says they were skipped?'),
    ("the rules forget the words need not match",
     '; the report need not repeat the instruction word for "\n    "word.', '."\n    "'),
    ("the rules forget the part done",
     ' An instruction done only in part, such as one meal of two, was not "\n    "carried out.', '"\n    "'),
    ("the rules let a vague report count as everything done",
     ' A report that says all is well, or that everything was done, without saying which instructions were "\n'
     '    "done, shows none of them carried out.', '"\n    "'),
    ("the rules let the model guess", ': take what it says as said, and do not guess beyond it."', '."'),
    ("the rules forget it is about this day",
     '"Rules: judge only what the REPORT says about this day. ', '"Rules: '),
    ("the warning is left out", 'HEADER + "\\n\\n" + UNTRUSTED + "\\n\\n"', 'HEADER + "\\n\\n"'),
    ("the warning comes after the blocks",
     [('HEADER + "\\n\\n" + UNTRUSTED + "\\n\\n"', 'HEADER + "\\n\\n"'),
      ('+ READING + "\\n\\n" + question', '+ UNTRUSTED + "\\n\\n" + READING + "\\n\\n" + question')]),
    ("only the report is called untrusted",
     "Everything inside the INSTRUCTIONS and REPORT blocks is", "Everything inside the REPORT block is"),
    ("the warning forgets the numbers are the contract's",
     ' The number at the start of each line of the "\n    "INSTRUCTIONS block was put there by the contract."', '"'),
    ("the rules are left out", '+ READING + "\\n\\n" + question', '+ question'),
    ("the header is left out", '        HEADER + "\\n\\n" + UNTRUSTED', '        UNTRUSTED'),
    ("the answer shape is not asked for",
     "'{\"answer\": [1, 3]} or {\"answer\": []} and nothing else.'", "'a list.'"),
    ("the answer may repeat numbers",
     'Use only the numbers shown in this INSTRUCTIONS block, each at most once. ',
     'Use the numbers shown in this INSTRUCTIONS block. '),

    # --- reading the model
    ("the model is asked in text mode",
     'gl.nondet.exec_prompt(_done_task(items, report, LISTED), response_format="json")',
     'gl.nondet.exec_prompt(_done_task(items, report, LISTED), response_format="text")'),
    ("a dict answer is not read",
     '    if isinstance(raw, dict):\n        return _only_answer(raw)', '    if False:\n        return _only_answer(raw)'),
    ("an object may carry other keys",
     'return table["answer"] if len(table) == 1 and "answer" in table else None', 'return table.get("answer", None)'),
    ("a text object may carry other keys",
     'return _only_answer(value) if isinstance(value, dict) else value',
     'return value.get("answer", None) if isinstance(value, dict) else value'),
    ("a long answer is read", '    if len(text) > MAX_ANSWER:\n        return None', '    if False:\n        return None'),
    ("the length cap is off by one", 'if len(text) > MAX_ANSWER:', 'if len(text) >= MAX_ANSWER:'),
    ("the length is measured after the fence comes off",
     '    if len(text) > MAX_ANSWER:\n        return None\n    try:\n        value = _loads_answer(_unfence_once(text))',
     '    try:\n        text = _unfence_once(text)\n        if len(text) > MAX_ANSWER:\n            return None\n'
     '        value = _loads_answer(text)'),
    ("a fenced answer is not unwrapped",
     'value = _loads_answer(_unfence_once(text))', 'value = _loads_answer(text)'),
    ("a fence is unwrapped twice",
     'value = _loads_answer(_unfence_once(text))', 'value = _loads_answer(_unfence_once(_unfence_once(text)))'),
    ("the json tag stays on a fenced answer",
     '        if inner.startswith("json"):\n            inner = inner[4:]', '        if False:\n            inner = inner[4:]'),
    ("a fence that never closes is unwrapped",
     'if text.startswith("```") and text.endswith("```"):', 'if text.startswith("```"):'),
    ("more numbers than instructions are read",
     'if not isinstance(value, list) or len(value) > n:', 'if not isinstance(value, list):'),
    ("an answer that is not a list is read",
     'if not isinstance(value, list) or len(value) > n:', 'if len(value) > n:'),
    ("a bool is read as a number",
     'if isinstance(item, bool) or not isinstance(item, int)', 'if not isinstance(item, int)'),
    ("a non-number is read", 'or not isinstance(item, int) or item < 1', 'or item < 1'),
    ("0 is read", 'item < 1 or item > n', 'item < 0 or item > n'),
    ("n + 1 is read", 'item < 1 or item > n or', 'item < 1 or item > n + 1 or'),
    ("a number given twice is read", ' or item in seen:', ':'),
    ("the numbers are not sorted", 'return tuple(sorted(seen))', 'return tuple(seen)'),
    ("the reversed numbering is not mapped back",
     'return tuple(sorted(n + 1 - k for k in nums[:MAX_INSTRUCTIONS]))',
     'return tuple(sorted(k for k in nums[:MAX_INSTRUCTIONS]))'),
    ("the reversed numbering is mapped back off by one", 'n + 1 - k for k', 'n - k for k'),
    ("the mapped answer is not sorted",
     'return tuple(sorted(n + 1 - k for k in nums[:MAX_INSTRUCTIONS]))',
     'return tuple(n + 1 - k for k in nums[:MAX_INSTRUCTIONS])'),
    ("unreadable answers are not refused",
     '    if done_a is None or done_b is None or left_a is None or left_b is None:\n        return UNCLEAR',
     '    if False:\n        return UNCLEAR'),
    ("the DONE numberings need not agree",
     'if done_a != done_b or left_a != left_b:', 'if left_a != left_b:'),
    ("the NOT_DONE numberings need not agree",
     'if done_a != done_b or left_a != left_b:', 'if done_a != done_b:'),
    ("a reading with nothing done is a mask",
     '    if len(done_a) == 0:\n        return UNCLEAR', '    if False:\n        return UNCLEAR'),
    ("an instruction in both lists is read as done", 'if done == left:', 'if not done and not left:'),
    ("an instruction in neither list is read as not done", 'if done == left:', 'if done and left:'),
    ("the mask marks are swapped",
     'mask += MASK_DONE if done else MASK_LEFT', 'mask += MASK_LEFT if done else MASK_DONE'),
    ("a mask of the wrong length is kept", 'len(mask) != n or ', ''),
    ("a mask of other characters is kept", ' or mask.strip(MASK_DONE + MASK_LEFT) != ""', ''),
    ("a mask with nothing done is kept", 'return mask if MASK_DONE in mask else UNCLEAR', 'return mask'),
    ("an agreed value that is not a dict is read", 'table = raw if isinstance(raw, dict) else {}', 'table = raw'),
    ("an agreed mask that is not text is read",
     'if not isinstance(mask, str) or len(mask) != n', 'if len(str(mask)) != n'),
    ("a leader that raised is agreed with",
     '    if not isinstance(leaders_res, gl.vm.Return):\n        return False',
     '    if False:\n        return False'),
    ("a leader value that is not a dict is agreed with",
     '    if not isinstance(theirs, dict):\n        return False', '    if False:\n        return False'),
    ("a validator's own failure escapes",
     '        mine = leader_fn()\n    except Exception:\n        return False',
     '        mine = leader_fn()\n    except ZeroDivisionError:\n        return False'),
    ("the validator agrees with anything", 'return theirs == mine', 'return True'),
    ("a failed model call is a reading",
     'raise gl.vm.UserError(ERROR_LLM + " a model call failed; nothing was stored, and the report may be "\n'
     '                                      "sent again")',
     'return {"mask": UNCLEAR}'),

    # --- call arguments
    ("a bool is a number", '    if isinstance(raw, bool):\n        return -1\n', ''),
    ("a negative number is taken", 'return raw if raw >= 0 else -1', 'return raw'),
    ("a long digit string is taken", 'len(s) <= 40 and _digits(s)', '_digits(s)'),
    ("another script's digits are taken",
     'return text != "" and text.isascii() and text.isdigit()', 'return text != "" and text.isdigit()'),
    ("an address of any length is taken",
     'if len(text) != ADDRESS_CHARS or not text.startswith("0x"):', 'if not text.startswith("0x"):'),
    ("an address without 0x is taken",
     'if len(text) != ADDRESS_CHARS or not text.startswith("0x"):', 'if len(text) != ADDRESS_CHARS:'),
    ("an address of any characters is taken", 'return text if text[2:].strip(HEX) == "" else ""', 'return text'),
    ("an address is matched in one letter case only", 'text = raw.strip().lower()', 'text = raw.strip()'),
    ("a text may be too short", 'if len(text) < least or len(text) > most:', 'if len(text) > most:'),
    ("a text may be too long", 'if len(text) < least or len(text) > most:', 'if len(text) < least:'),
    ("a text may span lines", 'if not (text.isascii() and text.isprintable()):', 'if not text.isascii():'),
    ("a text may be any script", 'if not (text.isascii() and text.isprintable()):', 'if not text.isprintable():'),
    ("the instructions may be any length as sent",
     '    if len(text) > MAX_INSTRUCTIONS_JSON:\n        return [], (', '    if False:\n        return [], ('),
    ("a fraction in the instructions is read",
     'return json.loads(text, parse_float=_refuse_fraction, parse_constant=_refuse_number)',
     'return json.loads(text, parse_constant=_refuse_number)'),
    ("NaN in the instructions is read",
     'return json.loads(text, parse_float=_refuse_fraction, parse_constant=_refuse_number)',
     'return json.loads(text, parse_float=_refuse_fraction)'),
    ("a fraction in an answer is read as a number",
     'return json.loads(text, parse_float=_keep_text, parse_constant=_refuse_number)',
     'return json.loads(text, parse_constant=_refuse_number)'),
    ("the instructions need not be a list",
     'if not isinstance(parsed, list) or len(parsed) < MIN_INSTRUCTIONS', 'if len(parsed) < MIN_INSTRUCTIONS'),
    ("no instruction is taken", 'len(parsed) < MIN_INSTRUCTIONS or ', ''),
    ("seven instructions are taken", ' or len(parsed) > MAX_INSTRUCTIONS:', ':'),
    ("an instruction need not be a string",
     '        if not isinstance(item, str):\n            return [], what + " is a string"',
     '        if False:\n            return [], what + " is a string"'),
    ("an instruction is not trimmed", '        item = item.strip()\n', ''),
    ("an instruction may be any length",
     'problem = _text_problem(item, MIN_INSTRUCTION, MAX_INSTRUCTION, what)',
     'problem = _text_problem(item, 0, 10 ** 6, what)'),
    ("an instruction may repeat", '        if item.lower() in lowered:\n', '        if False:\n'),
    ("a repeat is caught only in the same case", 'lowered.append(item.lower())', 'lowered.append(item)'),

    # --- the clock
    ("no clock reads as the epoch", 'return _instant_seconds(str(value)) if value else -1',
     'return _instant_seconds(str(value)) if value else 0'),
    ("every fourth century is a leap year",
     'leap = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0', 'leap = y % 4 == 0'),
    ("a month's last day is not checked", 'if not (1 <= d <= month_days):', 'if not (1 <= d <= 31):'),

    # --- book
    ("anything is taken as the sitter",
     '        if mate == "":\n            problem = "the sitter is an address',
     '        if False:\n            problem = "the sitter is an address'),
    ("the zero address may sit", 'elif mate == ZERO_ADDRESS:', 'elif False:'),
    ("the owner may sit for itself", 'elif mate == who:', 'elif False:'),
    ("the day rate has no floor", 'elif rate < MIN_RATE or rate > MAX_RATE:', 'elif rate > MAX_RATE:'),
    ("the day rate has no ceiling", 'elif rate < MIN_RATE or rate > MAX_RATE:', 'elif rate < MIN_RATE:'),
    ("a booking may have no day", 'elif n_days < MIN_DAYS or n_days > MAX_DAYS:', 'elif n_days > MAX_DAYS:'),
    ("a booking may run past fourteen days",
     'elif n_days < MIN_DAYS or n_days > MAX_DAYS:', 'elif n_days < MIN_DAYS:'),
    ("a day may be shorter than ten minutes",
     'elif seconds < MIN_DAY_SECONDS or seconds > MAX_DAY_SECONDS:', 'elif seconds > MAX_DAY_SECONDS:'),
    ("a day may be longer than a day",
     'elif seconds < MIN_DAY_SECONDS or seconds > MAX_DAY_SECONDS:', 'elif seconds < MIN_DAY_SECONDS:'),
    ("a booking may start before the sitter could accept",
     'elif start < now + MIN_LEAD or start > now + MAX_LEAD:', 'elif start < now or start > now + MAX_LEAD:'),
    ("a booking may start any time later",
     'elif start < now + MIN_LEAD or start > now + MAX_LEAD:', 'elif start < now + MIN_LEAD:'),
    ("the shortest lead is off by one", 'start < now + MIN_LEAD or', 'start <= now + MIN_LEAD or'),
    ("the longest lead is off by one", 'start > now + MAX_LEAD:', 'start >= now + MAX_LEAD:'),
    ("no clock is let through",
     '        elif now < 0:\n            problem = "no readable clock',
     '        elif False:\n            problem = "no readable clock'),
    ("any amount books", 'elif value != rate * n_days:', 'elif False:'),
    ("more than the price books", 'elif value != rate * n_days:', 'elif value < rate * n_days:'),
    ("a refusal keeps what was sent",
     '        _send(sender, value)\n        return json.dumps({"ok": False', '        return json.dumps({"ok": False'),
    ("a refusal is not counted", '        self.n_refused = u32(int(self.n_refused) + 1)\n', ''),
    ("a refusal's return is not recorded", '        self.returned = u256(int(self.returned) + value)\n', ''),
    ("the instructions are not stored",
     '            self.instruction_rows[bid + ":" + str(k + 1)] = item\n', '            pass\n'),
    ("the instructions are stored from 0",
     'self.instruction_rows[bid + ":" + str(k + 1)] = item', 'self.instruction_rows[bid + ":" + str(k)] = item'),
    ("the escrow is not counted as held",
     '        self.held_total = u256(int(self.held_total) + value)\n', ''),
    ("the escrow is not counted as taken",
     '        self.taken_total = u256(int(self.taken_total) + value)\n', ''),
    ("the owner does not find the booking", '        self._push("party:" + who, bid)\n', ''),
    ("the sitter does not find the booking", '        self._push("party:" + mate, bid)\n', ''),
    ("the booking holds one day of what was paid", 'held=u256(value)', 'held=u256(rate)'),
    ("the booking keeps one day", 'last_day=u32(n_days)', 'last_day=u32(1)'),
    ("offers are not counted", '        self.n_offered = u32(int(self.n_offered) + 1)\n', ''),
    ("a list keeps one slot", '        self.counts[list_key] = u32(n + 1)\n', ''),

    # --- the offer
    ("anyone withdraws an offer",
     '        if _low(gl.message.sender_address) != _low(b.owner):\n            _fail("only the owner of " + bid + " may withdraw it")',
     '        if False:\n            _fail("only the owner of " + bid + " may withdraw it")'),
    ("an accepted booking is withdrawn",
     '        if str(b.status) != ST_OFFERED:\n            _fail(bid + " is " + str(b.status) + "; only an offer the sitter',
     '        if False:\n            _fail(bid + " is " + str(b.status) + "; only an offer the sitter'),
    ("anyone declines",
     '        if _low(gl.message.sender_address) != _low(b.sitter):\n            _fail("only the sitter of " + bid + " may decline it")',
     '        if False:\n            _fail("only the sitter of " + bid + " may decline it")'),
    ("an accepted booking is declined",
     '        if str(b.status) != ST_OFFERED:\n            _fail(bid + " is " + str(b.status) + "; only an offer not yet accepted can be declined")',
     '        if False:\n            _fail(bid + " is " + str(b.status) + "; only an offer not yet accepted can be declined")'),
    ("anyone accepts",
     '        if _low(gl.message.sender_address) != _low(b.sitter):\n            _fail("only the sitter of " + bid + " may accept it")',
     '        if False:\n            _fail("only the sitter of " + bid + " may accept it")'),
    ("an accepted booking is accepted again",
     '        if str(b.status) != ST_OFFERED:\n            _fail(bid + " is " + str(b.status) + "; only an offer can be accepted")',
     '        if False:\n            _fail(bid + " is " + str(b.status) + "; only an offer can be accepted")'),
    ("an offer is accepted after its start",
     '        if now >= int(b.start_at):\n            _fail("the first day of "',
     '        if False:\n            _fail("the first day of "'),
    ("an offer is accepted at its first instant", 'if now >= int(b.start_at):', 'if now > int(b.start_at):'),
    ("an accepted booking is not active", '        b.status = ST_ACTIVE\n', ''),
    ("acceptance is not counted",
     '        self.n_active = u32(int(self.n_active) + 1)\n        return json.dumps({"ok": True, "booking": bid, "status": ST_ACTIVE',
     '        return json.dumps({"ok": True, "booking": bid, "status": ST_ACTIVE'),
    ("a closed offer keeps its escrow", '        _send(b.owner, held)\n        return held', '        return held'),
    ("a closed offer still holds",
     '        b.held = u256(0)\n        b.to_owner = u256(int(b.to_owner) + held)\n',
     '        b.to_owner = u256(int(b.to_owner) + held)\n'),
    ("a closed offer stays counted as held",
     '        self.held_total = u256(int(self.held_total) - held)\n', ''),
    ("a closed offer is still offered", '        b.status = status\n        b.closed_at = u64(now)\n',
     '        b.closed_at = u64(now)\n'),
    ("a declined offer is counted as withdrawn",
     '        if status == ST_DECLINED:\n            self.n_declined', '        if False:\n            self.n_declined'),

    # --- credit
    ("a deposit of nothing is taken",
     '        if value <= 0:\n            return self._refuse(sender, value, "send the amount',
     '        if False:\n            return self._refuse(sender, value, "send the amount'),
    ("a deposit replaces the credit", 'credit = self._credit(who) + value', 'credit = value'),
    ("a deposit is not counted", '        self.credit_total = u256(int(self.credit_total) + value)\n', ''),
    ("a withdrawal of nothing is allowed",
     '        if amount <= 0:\n            _fail("there is no credit', '        if False:\n            _fail("there is no credit'),
    ("a withdrawal leaves the credit", '        self.credit_rows[who] = u256(0)\n', ''),
    ("a withdrawal sends nothing", '        _send(sender, amount)\n', ''),
    ("a withdrawal is not counted", '        self.credit_total = u256(int(self.credit_total) - amount)\n', ''),

    # --- report
    ("anyone reports",
     '        if who != _low(b.sitter):\n            _fail("only the sitter of " + bid + " may report on it")',
     '        if False:\n            _fail("only the sitter of " + bid + " may report on it")'),
    ("a report is taken on an offer",
     '        if str(b.status) != ST_ACTIVE:\n            _fail(bid + " is " + str(b.status) + "; reports are taken while it is active")',
     '        if False:\n            _fail(bid + " is " + str(b.status) + "; reports are taken while it is active")'),
    ("day 0 is reported", 'if d < 1 or d > int(b.days):', 'if d > int(b.days):'),
    ("a day past the booking is reported", 'if d < 1 or d > int(b.days):', 'if d < 1:'),
    ("a day ended early is reported",
     '        if d > int(b.last_day):\n            _fail("day "', '        if False:\n            _fail("day "'),
    ("a report is taken before its day",
     '        if now < opens:\n            _fail("day "', '        if False:\n            _fail("day "'),
    ("a report is refused at its first instant",
     '        if now < opens:\n            _fail("day "', '        if now <= opens:\n            _fail("day "'),
    ("a report is taken after its window",
     '        if now >= closes:\n            _fail("the report window', '        if False:\n            _fail("the report window'),
    ("the window closes a second late", 'if now >= closes:', 'if now > closes:'),
    ("the window has no grace",
     'return opens, opens + int(b.day_seconds) + REPORT_GRACE', 'return opens, opens + int(b.day_seconds)'),
    ("the window opens a day late",
     'opens = int(b.start_at) + (d - 1) * int(b.day_seconds)', 'opens = int(b.start_at) + d * int(b.day_seconds)'),
    ("a settled day takes another report",
     '            if str(row.status) != D_UNCLEAR:\n                _fail("day " + str(d) + " of " + bid + " is already "',
     '            if False:\n                _fail("day " + str(d) + " of " + bid + " is already "'),
    ("the tries are not read",
     '            tries = int(row.tries)\n        if tries >= MAX_REPORTS:', '        if tries >= MAX_REPORTS:'),
    ("a third report is taken", 'if tries >= MAX_REPORTS:', 'if tries > MAX_REPORTS:'),
    ("re-reports are unlimited",
     '        if tries >= MAX_REPORTS:\n            _fail(', '        if False:\n            _fail('),
    ("three reports a day", 'MAX_REPORTS = 2 ', 'MAX_REPORTS = 3 '),
    ("a report of any length",
     'problem = _text_problem(text, MIN_REPORT, MAX_REPORT, "a report")', 'problem = ""'),
    ("a report without credit",
     '        if credit < REPORT_FEE:\n            _fail("a report takes a fee',
     '        if False:\n            _fail("a report takes a fee'),
    ("a report needs more than the fee", 'if credit < REPORT_FEE:', 'if credit <= REPORT_FEE:'),
    ("the fee is free", 'REPORT_FEE = ATTO // 100 ', 'REPORT_FEE = 0 '),
    ("the round is not asked",
     'mask = self._judge_report(self._instructions(bid, n), text)', 'mask = MASK_DONE * n'),
    ("the round is asked about other instructions",
     'mask = self._judge_report(self._instructions(bid, n), text)',
     'mask = self._judge_report(self._instructions(bid, n)[:1], text)'),
    ("an unclear reading takes no fee", '            credit -= REPORT_FEE\n', ''),
    ("an unclear fee stays in the sitter's credit",
     '            credit -= REPORT_FEE\n            self.credit_rows[who] = u256(credit)\n',
     '            credit -= REPORT_FEE\n'),
    ("an unclear fee is not sent to the owner", '            _send(b.owner, REPORT_FEE)\n', ''),
    ("an unclear fee goes to the sitter", '_send(b.owner, REPORT_FEE)', '_send(b.sitter, REPORT_FEE)'),
    ("an unclear fee is not counted",
     '            self.fees_to_owners = u256(int(self.fees_to_owners) + REPORT_FEE)\n', ''),
    ("an unclear fee is not counted on the booking",
     '            b.fees_to_owner = u256(int(b.fees_to_owner) + REPORT_FEE)\n', ''),
    ("an unclear fee is not counted on the day",
     '            row.fees_to_owner = u256(int(row.fees_to_owner) + REPORT_FEE)\n', ''),
    ("the credit total keeps an unclear fee",
     '            self.credit_total = u256(int(self.credit_total) - REPORT_FEE)\n', ''),
    ("an unclear reading pays the day",
     '        if mask == UNCLEAR:\n            fee = "to_owner"', '        if False:\n            fee = "to_owner"'),
    ("the share rounds up", 'int(b.day_rate) * done // n', '-(-int(b.day_rate) * done // n)'),
    ("the share is the whole rate",
     'self._settle_day(b, row, D_PAID, int(b.day_rate) * done // n, now)',
     'self._settle_day(b, row, D_PAID, int(b.day_rate), now)'),
    ("the share counts the instructions not done", 'done = mask.count(MASK_DONE)', 'done = mask.count(MASK_LEFT)'),
    ("the second report overwrites the first",
     '        if tries == 1:\n            row.report_1', '        if True:\n            row.report_1'),
    ("re-reports are not counted", '            self.n_rereports = u32(int(self.n_rereports) + 1)\n', ''),
    ("the tries are not stored", '        row.tries = u32(tries)\n', ''),
    ("reports are not counted", '        self.n_reports = u32(int(self.n_reports) + 1)\n', ''),
    ("reports are not counted on the booking", '        b.n_reports = u32(int(b.n_reports) + 1)\n', ''),
    ("the paid mask is not stored", '            row.mask = mask\n', ''),
    ("the done count is not stored", '            row.done = u32(done)\n', ''),
    ("the instructions done are not counted", '            b.n_done = u32(int(b.n_done) + done)\n', ''),
    ("clear readings are not counted", '            self.n_clear = u32(int(self.n_clear) + 1)\n', ''),
    ("unclear readings are not counted", '            self.n_unclear = u32(int(self.n_unclear) + 1)\n', ''),

    # --- one day settled
    ("the owner gets the whole rate too", 'to_owner = rate - to_sitter', 'to_owner = rate'),
    ("a settled day still holds", '        b.held = u256(int(b.held) - rate)\n', ''),
    ("the sitter's share is not booked", '        b.to_sitter = u256(int(b.to_sitter) + to_sitter)\n', ''),
    ("the owner's share is not booked",
     '        b.to_owner = u256(int(b.to_owner) + to_owner)\n        b.settled', '        b.settled'),
    ("a settled day is not counted", '        b.settled = u32(int(b.settled) + 1)\n', ''),
    ("the held total keeps a settled day", '        self.held_total = u256(int(self.held_total) - rate)\n', ''),
    ("the sitter is not paid", '        _send(b.sitter, to_sitter)\n', ''),
    ("the owner is not paid", '        _send(b.owner, to_owner)\n', ''),
    ("the share goes to the owner", '_send(b.sitter, to_sitter)', '_send(b.owner, to_sitter)'),
    ("the day's status is not stored",
     '        row.status = status\n        row.to_sitter', '        row.to_sitter'),
    ("the last day does not finish the booking",
     '        if int(b.settled) >= int(b.last_day):\n            self._finish(b, now)',
     '        if False:\n            self._finish(b, now)'),
    ("the booking finishes a day early",
     'if int(b.settled) >= int(b.last_day):', 'if int(b.settled) + 1 >= int(b.last_day):'),
    ("paid days are counted as closed",
     '        if status == D_PAID:\n            self.n_days_paid', '        if False:\n            self.n_days_paid'),
    ("a finished booking stays counted as active", '        self.n_active = u32(int(self.n_active) - 1)\n', ''),
    ("a finished booking stays active", '        b.status = ST_FINISHED\n', ''),

    # --- close_day
    ("a day is closed on an offer",
     '        if str(b.status) != ST_ACTIVE:\n            _fail(bid + " is " + str(b.status) + "; days are closed while it is active")',
     '        if False:\n            _fail(bid + " is " + str(b.status) + "; days are closed while it is active")'),
    ("a day is closed inside its window",
     '        if now < closes:\n            _fail("the report window for day "',
     '        if False:\n            _fail("the report window for day "'),
    ("a day is closed a second early",
     '        if now < closes:\n            _fail("the report window for day "',
     '        if now < closes - 1:\n            _fail("the report window for day "'),
    ("a settled day is closed",
     '            if str(self.day_rows[key].status) != D_UNCLEAR:\n', '            if False:\n'),
    ("a closed day pays the sitter",
     'self._settle_day(b, row, D_CLOSED, 0, now)', 'self._settle_day(b, row, D_CLOSED, int(b.day_rate), now)'),

    # --- end
    ("anyone ends a booking",
     '        if _low(gl.message.sender_address) != _low(b.owner):\n            _fail("only the owner of " + bid + " may end it")',
     '        if False:\n            _fail("only the owner of " + bid + " may end it")'),
    ("an offer is ended",
     '        if str(b.status) != ST_ACTIVE:\n            _fail(bid + " is " + str(b.status) + "; only an active booking can be ended")',
     '        if False:\n            _fail(bid + " is " + str(b.status) + "; only an active booking can be ended")'),
    ("a booking with no day left to end is ended",
     '        if begun >= last:\n            _fail(', '        if False:\n            _fail('),
    ("the refund counts begun days", 'refund = (last - begun) * int(b.day_rate)', 'refund = last * int(b.day_rate)'),
    ("the ended days stay part of the booking", '        b.last_day = u32(begun)\n', ''),
    ("the refund still counts as held", '        b.held = u256(int(b.held) - refund)\n', ''),
    ("the refund is not booked to the owner", '        b.to_owner = u256(int(b.to_owner) + refund)\n', ''),
    ("the held total keeps the refund", '        self.held_total = u256(int(self.held_total) - refund)\n', ''),
    ("the refund is not sent", '        _send(b.owner, refund)\n', ''),
    ("an end with every begun day settled does not finish",
     '        if int(b.settled) >= begun:\n            self._finish(b, now)',
     '        if False:\n            self._finish(b, now)'),
    ("an end finishes with a begun day unsettled", 'if int(b.settled) >= begun:', 'if int(b.settled) + 1 >= begun:'),
    ("no end date is kept", '        b.ended_at = u64(now)\n', ''),
    ("days begin a day late",
     'return min(int(b.days), (now - int(b.start_at)) // int(b.day_seconds) + 1)',
     'return min(int(b.days), (now - int(b.start_at)) // int(b.day_seconds))'),
    ("days begin past the booking",
     'return min(int(b.days), (now - int(b.start_at)) // int(b.day_seconds) + 1)',
     'return (now - int(b.start_at)) // int(b.day_seconds) + 1'),
    ("the first day begins a second late", '    if now < int(b.start_at):\n        return 0',
     '    if now <= int(b.start_at):\n        return 0'),

    # --- views
    ("a list page may be longer than twenty",
     'size = PAGE if size < 1 or size > PAGE else size\n        ids = ',
     'size = PAGE if size < 1 else size\n        ids = '),
    ("a page of days may be longer than twenty",
     'size = PAGE if size < 1 or size > PAGE else size\n        now = _now()',
     'size = PAGE if size < 1 else size\n        now = _now()'),
    ("a page of days of no rows asks for none",
     'size = PAGE if size < 1 or size > PAGE else size\n        now = _now()',
     'size = PAGE if size > PAGE else size\n        now = _now()'),
    ("a negative offset is kept",
     'total = int(self.booking_rows[key].days)\n        start = max(_number_arg(offset), 0)',
     'total = int(self.booking_rows[key].days)\n        start = _number_arg(offset)'),
    ("bookings_of reads one letter case",
     'key = address.strip().lower()[:ADDRESS_CHARS]\n        total, start, size, ids = self._page',
     'key = address.strip()[:ADDRESS_CHARS]\n        total, start, size, ids = self._page'),
    ("credit reads one letter case",
     'key = address.strip().lower()[:ADDRESS_CHARS]\n        amount = self._credit(key)',
     'key = address.strip()[:ADDRESS_CHARS]\n        amount = self._credit(key)'),
    ("a day past the booking is shown", 'if d < 1 or d > int(self.booking_rows[key].days):', 'if d < 1:'),
    ("a settled day shows as open", '        if stored in (D_PAID, D_CLOSED):\n            state = stored',
     '        if False:\n            state = stored'),
    ("a void offer shows as running", '        elif status in (ST_DECLINED, ST_WITHDRAWN):\n            state = "void"',
     '        elif False:\n            state = "void"'),
    ("an offer shows as running", '        elif status == ST_OFFERED:\n            state = "offered"',
     '        elif False:\n            state = "offered"'),
    ("an ended day shows as running", '        elif d > int(b.last_day):\n            state = "ended"',
     '        elif False:\n            state = "ended"'),
    ("no clock reads as a moment", '        elif now < 0:\n            state = "unknown"',
     '        elif False:\n            state = "unknown"'),
    ("a day shows as open a second early", 'elif now < opens:\n            state = "upcoming"',
     'elif now < opens - 1:\n            state = "upcoming"'),
    ("the view's window has no end", '        elif now < closes:\n            state = D_UNCLEAR',
     '        elif True:\n            state = D_UNCLEAR'),
    ("an unclear day shows as open", 'state = D_UNCLEAR if stored == D_UNCLEAR else "open"', 'state = "open"'),
    ("a day that took two reports can still be reported",
     'out["can_report"] = state in ("open", D_UNCLEAR) and int(out["tries"]) < MAX_REPORTS',
     'out["can_report"] = state in ("open", D_UNCLEAR)'),
    ("the second report is not shown", '            if tries >= 2:\n                reports.append',
     '            if False:\n                reports.append'),
    ("the booking view counts days without a clock",
     'row["begun"] = _started(self.booking_rows[key], now) if now >= 0 else -1',
     'row["begun"] = _started(self.booking_rows[key], now)'),
    ("the sitter is shown as owner", 'row["role"] = "owner" if row["owner"] == key else "sitter"',
     'row["role"] = "owner"'),
    ("the rules forget one action per instruction",
     '                "one_action": "one action per instruction; a combined instruction is paid only when every part is "\n'
     '                              "reported",\n', ''),

    # --- the limits
    ("the grace is five minutes", 'REPORT_GRACE = 1800 ', 'REPORT_GRACE = 300 '),
    ("six instructions become five", 'MAX_INSTRUCTIONS = 6\n', 'MAX_INSTRUCTIONS = 5\n'),
    ("instructions may be shorter", 'MIN_INSTRUCTION = 10\n', 'MIN_INSTRUCTION = 1\n'),
    ("a report may be shorter", 'MIN_REPORT = 30\n', 'MIN_REPORT = 10\n'),
    ("a day may be a minute", 'MIN_DAY_SECONDS = 600 ', 'MIN_DAY_SECONDS = 60 '),
    ("a booking may start at once", 'MIN_LEAD = 300 ', 'MIN_LEAD = 0 '),
    ("a booking may run a month", 'MAX_DAYS = 14\n', 'MAX_DAYS = 31\n'),
]


def _env(**extra):
    return dict(os.environ, PYTHONDONTWRITEBYTECODE="1", **extra)


def run(path: pathlib.Path) -> str:
    out = subprocess.run(PYTEST, env=_env(SITTER_SOURCE=str(path)), capture_output=True, text=True, cwd=ROOT)
    if out.returncode == 0:
        return ""
    text = out.stdout + out.stderr
    if "error during collection" in text or "IndentationError" in text or "SyntaxError" in text:
        raise RuntimeError("the mutant does not even import; that is a broken anchor, not a killed defence:\n"
                           + text[-600:])
    m = re.search(r"FAILED tests/test_pure\.py::(\S+)", text)
    if not m:
        raise RuntimeError("a test failed but its name could not be read:\n" + text[-800:])
    return m.group(1)


def edits_of(rest):
    return rest[0] if len(rest) == 1 else [(rest[0], rest[1])]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    names = [m[0] for m in MUTATIONS]
    if len(set(names)) != len(names):
        print("two mutants share a name")
        return 2
    chosen = [m for m in MUTATIONS if args.only in m[0]]
    texts = []
    for name, *rest in chosen:
        text = SRC
        for old, new in edits_of(rest):
            if SRC.count(old) != 1:
                print(f"  ! anchor found {SRC.count(old)} times, expected once: {name}")
                return 2
            text = text.replace(old, new)
        if text == SRC:
            print(f"  ! the mutant is the source itself: {name}")
            return 2
        texts.append((name, text))
    baseline = subprocess.run(PYTEST, env=_env(), capture_output=True, text=True, cwd=ROOT)
    if baseline.returncode != 0:
        print("the unmutated suite does not pass; a mutation table over a failing suite proves nothing")
        print((baseline.stdout + baseline.stderr)[-600:])
        return 3
    results = {}
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for k, (name, text) in enumerate(texts):
            path = pathlib.Path(tmp) / f"sitter_{k}.py"
            path.write_text(text, encoding="utf-8")
            paths.append((name, path))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
            futures = {pool.submit(run, path): name for name, path in paths}
            for future in concurrent.futures.as_completed(futures):
                name = futures[future]
                killer = future.result()
                results[name] = killer
                print(f"  {'killed ' if killer else 'ESCAPED'}  {name}" + (f"  <- {killer}" if killer else ""), flush=True)
    rows = [(name, results[name]) for name, _ in texts]
    escaped = [name for name, killer in rows if not killer]
    if escaped:
        print(f"\n{len(escaped)} mutant(s) escaped; no table written:")
        for name in escaped:
            print("  - " + name)
        return 1
    if args.only:
        print(f"\n{len(rows)} / {len(rows)} killed (a subset; tests/MUTATIONS.md left as it was)")
        return 0
    table = ["# Mutations", "",
             f"{len(rows)} defences in `contracts/sitter.py`, each removed or inverted in turn, and the test "
             "that failed because of it. Generated by `tools/mutate.py`; it refuses to write this file if any mutant "
             "survives, if an anchor is not found exactly once, or if the unmutated suite is not green.", "",
             "| defence removed | killed by |", "|---|---|"]
    table += [f"| {n} | `{k}` |" for n, k in rows] + [""]
    (ROOT / "tests" / "MUTATIONS.md").write_text("\n".join(table), encoding="utf-8")
    print(f"\n{len(rows)} / {len(rows)} killed - tests/MUTATIONS.md written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
