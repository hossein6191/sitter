"use client";

// Mock mode only. There is no wallet and no chain: the visitor acts as one of the demo accounts of the
// in-memory contract, and this strip says so on every page, lets them change account, gives test GEN,
// and moves the clock on so a day can be seen opening and its report window closing.

import { useLocal } from "@/components/use-local";
import { PERSONAS, advanceClock, mockAddress, mockBalanceText, mockClockOffset, setMockPersona } from "@/lib/chain-mock";
import { faucet } from "@/lib/chain";
import { gen, span } from "@/lib/format";

const small = "h-8 rounded-full border-2 border-white bg-card px-2.5 text-xs font-extrabold shadow-[0_2px_0_var(--color-line-strong)] hover:bg-plum-wash active:translate-y-px";

export function MockBar() {
  const address = useLocal(mockAddress, PERSONAS[0].address);
  const balance = useLocal(() => mockBalanceText(mockAddress()), "0");
  const offset = useLocal(mockClockOffset, 0);
  return (
    <div className="rounded-2xl border-2 border-dashed border-plum-soft bg-plum-wash/70 px-3 py-2 text-xs">
      <p>
        <strong className="font-extrabold">Demo build.</strong> An in-memory copy of the contract: no model is asked here. The demo sitter&apos;s fixed reports and the
        sitting page&apos;s report chips are read as they are written to be; any other report lands unclear here, where on chain every validator reads it for itself. A
        reload starts again.
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <label htmlFor="mock-persona" className="shrink-0 font-extrabold">
          Acting as
        </label>
        <select id="mock-persona" value={address} onChange={(e) => setMockPersona(e.target.value)} className="h-8 max-w-full min-w-0 rounded-full border-2 border-white bg-card px-2 text-xs">
          {PERSONAS.map((p) => (
            <option key={p.address} value={p.address}>
              {p.name}: {p.note}
            </option>
          ))}
        </select>
        <span className="mono whitespace-nowrap">{gen(balance)}</span>
        <button type="button" onClick={() => void faucet(address)} className={small}>
          +10 GEN
        </button>
        <button type="button" onClick={() => advanceClock(60)} className={small}>
          Clock +1 min
        </button>
        <button type="button" onClick={() => advanceClock(600)} className={small}>
          +10 min
        </button>
        <button type="button" onClick={() => advanceClock(1800)} className={small}>
          +30 min
        </button>
        <button type="button" onClick={() => advanceClock(86400)} className={small}>
          +1 day
        </button>
        {offset > 0 && <span className="text-ink-2">clock moved on {span(offset)}</span>}
      </div>
    </div>
  );
}
