"use client";

// A sitter's credit for report fees: how much there is, how many reports it pays for, a deposit with
// suggested amounts, and taking the whole of it back.

import * as React from "react";

import { Sticker } from "@/components/button";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, readCredit } from "@/lib/chain";
import { gen, tryAtto } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { REPORT_FEE } from "@/lib/rules";
import { DEPOSIT_CHIPS } from "@/lib/suggestions";

export function CreditCard({ address, compact }: { address: string; compact?: boolean }) {
  const credit = useRead(() => readCredit(address), [address], { enabled: !!address });
  useAfterTx(credit.refresh);
  const [amount, setAmount] = React.useState("0.05");
  const tx = useTx();
  const atto = tryAtto(amount);
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const have = credit.data ? BigInt(credit.data.creditAtto) : 0n;
  const [kind, setKind] = React.useState<"deposit" | "withdraw">("deposit");
  const label = kind === "deposit" ? `Depositing ${atto !== null ? gen(atto) : ""} of report credit` : "Withdrawing your whole credit";
  return (
    <div className="sheet p-4">
      <p className="kicker text-plum">Report credit</p>
      <p className="mt-1 text-[0.9rem] text-ink-2">
        Each report takes {gen(REPORT_FEE)} from this credit: it stays yours on a clear reading and goes to the owner on an unclear one.
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="mono text-[1.5rem] font-semibold text-plum-deep">{credit.data ? gen(credit.data.creditAtto) : credit.error ? "?" : "…"}</span>
        {credit.data && <span className="text-[0.85rem] text-ink-3">enough for {credit.data.reports} report{credit.data.reports === 1 ? "" : "s"}</span>}
      </p>
      {credit.error && <p className="text-[0.8rem] text-brick-ink">Could not read the credit ({credit.error}).</p>}
      {!compact || have < REPORT_FEE ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="label" htmlFor={"deposit-" + address}>
            Deposit, in GEN
          </label>
          <input id={"deposit-" + address} inputMode="decimal" className="field mono max-w-[12rem]" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
          <Suggest label="Deposit amounts" chips={DEPOSIT_CHIPS} onPick={setAmount} isOn={(v) => v === amount} />
          <WalletGate need={atto ?? 0n} what="to deposit">
            <div className="flex flex-wrap gap-2">
              <Sticker
                size="sm"
                disabled={busy || atto === null || atto <= 0n}
                onClick={() => {
                  if (atto === null) return;
                  setKind("deposit");
                  void tx.start(calls.deposit(atto));
                }}
              >
                Deposit {atto !== null ? gen(atto) : ""}
              </Sticker>
              <Sticker
                size="sm"
                variant="paper"
                disabled={busy || have <= 0n}
                onClick={() => {
                  setKind("withdraw");
                  void tx.start(calls.withdraw());
                }}
              >
                Withdraw it all
              </Sticker>
            </div>
          </WalletGate>
        </div>
      ) : null}
      <TxStage
        className="mt-3"
        tx={tx}
        sign={signGuide({ fn: kind, label, amountAtto: kind === "deposit" ? (atto ?? 0n).toString() : have.toString(), mock: isMock })}
        sending={sendingGuide({ fn: kind, label, amountAtto: kind === "deposit" ? (atto ?? 0n).toString() : have.toString(), mock: isMock })}
        label={label}
      />
    </div>
  );
}
