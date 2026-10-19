"use client";

// Who is acting. On the chain that is the connected wallet. In mock mode there is no wallet: the
// visitor picks one of the demo accounts in the bar under the header, and every page reads and
// signs as that account against the in-memory contract.

import { useWallet } from "@/components/wallet";
import { useLocal } from "@/components/use-local";
import { isMock } from "@/lib/chain";
import { mockAddress, mockBalanceText } from "@/lib/chain-mock";

export type Me = {
  /** lowercase 0x address, or "" when nobody is connected */
  address: string;
  balanceAtto: bigint;
  /** true when a signature can be asked for right now */
  ready: boolean;
};

export function useMe(): Me {
  const w = useWallet();
  const persona = useLocal(mockAddress, "");
  const mockBalance = useLocal(() => (isMock ? mockBalanceText(mockAddress()) : "0"), "0");
  if (isMock) return { address: persona, balanceAtto: BigInt(mockBalance), ready: !!persona };
  return { address: w.address.toLowerCase(), balanceAtto: w.balanceAtto, ready: !!w.address && w.onStudio };
}
