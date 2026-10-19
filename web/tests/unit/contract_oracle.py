"""The contract's own pure helpers, answering for the site's tests.

tests/unit/*.test.mjs run this with `python3 -I` and a JSON list of calls on stdin, so the TypeScript
copies of the contract's rules (lib/rules.ts), its windows and the in-memory contract's rules() are
compared with contracts/sitter.py itself, not with a description of it. A stub stands in for the
GenLayer runtime: nothing here touches a network or a model.
"""

import importlib.util
import json
import pathlib
import sys
import types


def _stub():
    stub = types.ModuleType("genlayer")

    class _Any:
        def __getattr__(self, n):
            return _Any()

        def __call__(self, *a, **k):
            return _Any()

        def __getitem__(self, n):
            return _Any()

    class _UserError(Exception):
        pass

    class _VM:
        UserError = _UserError
        Return = object
        Result = object

    class _Public:
        view = staticmethod(lambda f: f)

        class _Write:
            def __call__(self, f):
                return f

            payable = staticmethod(lambda f: f)

        write = _Write()

    class _EVM:
        @staticmethod
        def contract_interface(c):
            return c

    class _GL:
        vm = _VM()
        public = _Public()
        evm = _EVM()

        class Contract:
            pass

        def __getattr__(self, n):
            return _Any()

    class _T:
        def __init__(self, *a, **k):
            pass

        def __class_getitem__(cls, item):
            return cls

    stub.gl = _GL()
    stub.allow_storage = lambda c: c
    stub.Address = str
    stub.DynArray = _T
    stub.TreeMap = _T
    stub.u256 = int
    stub.u32 = int
    stub.u64 = int
    stub.i64 = int
    stub.__all__ = ["gl", "allow_storage", "Address", "DynArray", "TreeMap", "u256", "u32", "u64", "i64"]
    sys.modules["genlayer"] = stub


def _load():
    _stub()
    path = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "sitter.py"
    spec = importlib.util.spec_from_file_location("sitter", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


st = _load()

ALLOWED = {"_text_problem", "_number_arg", "_address_text", "_instructions_of"}


def _booking(state):
    """A Booking row from the site's window shape (camelCase), the rest filled with what does not matter here."""
    return st.Booking(
        owner="0xo", sitter="0xs", n_instructions=1, day_rate=0, days=state["days"], day_seconds=state["daySeconds"],
        start_at=state["startAt"], status="active", booked_at=0, accepted_at=0, closed_at=0, ended_at=0,
        last_day=state["days"], settled=0, held=0, to_sitter=0, to_owner=0, fees_to_owner=0, n_reports=0, n_unclear=0,
        n_done=0, n_judged=0,
    )


def answer(call):
    fn = call["fn"]
    args = call.get("args", [])
    if fn == "rules":
        return json.loads(st.Sitter.rules(None))
    if fn == "const":
        value = getattr(st, args[0])
        return str(value) if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 2 ** 53 else value
    if fn == "_window":
        return list(st._window(_booking(args[0]), args[1]))
    if fn == "_started":
        return st._started(_booking(args[0]), args[1])
    if fn not in ALLOWED:
        raise ValueError("not an allowed helper: " + fn)
    out = getattr(st, fn)(*args)
    return list(out) if isinstance(out, tuple) else out


def main():
    calls = json.loads(sys.stdin.read())
    results = []
    for call in calls:
        try:
            results.append({"ok": answer(call)})
        except Exception as e:  # a helper that raises is an answer too
            results.append({"error": type(e).__name__ + ": " + str(e)})
    sys.stdout.write(json.dumps(results))


main()
