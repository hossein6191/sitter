// Browser-wallet plumbing with no React in it: EIP-6963 discovery, the Studio chain
// parameters, chain switching, and the "who is signing" registry that lib/chain.ts reads.
//
// Every wallet in the browser announces itself through EIP-6963, so a page with more than
// one installed asks which, rather than guessing. Picking one on the reader's behalf is a
// silent decision about whose key signs; this module only lists, the UI asks.

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf22f";
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

/** wallet_addEthereumChain parameters for GenLayer Studio. */
export const STUDIO_CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "GenLayer Studio",
  rpcUrls: [RPC_URL],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: [EXPLORER_URL],
} as const;

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type EIP6963ProviderInfo = { uuid: string; name: string; icon: string; rdns: string };
export type EIP6963ProviderDetail = { info: EIP6963ProviderInfo; provider: EIP1193Provider };

/** rdns given to a wallet that predates EIP-6963 and is only reachable as window.ethereum. */
export const LEGACY_RDNS = "window.ethereum";

const STORAGE_KEY = "sitter.wallet.rdns";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<EIP6963ProviderDetail>;
  }
}

/**
 * Starts EIP-6963 discovery. `onChange` gets the full list every time a wallet announces.
 * Returns a stop function. Safe to call only in the browser.
 */
export function discoverWallets(onChange: (list: EIP6963ProviderDetail[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const found: EIP6963ProviderDetail[] = [];
  const handler = (e: Event) => {
    const d = (e as CustomEvent<EIP6963ProviderDetail>).detail;
    if (!d?.info?.rdns || !d.provider) return;
    if (found.some((p) => p.info.rdns === d.info.rdns)) return;
    found.push(d);
    onChange([...found]);
  };
  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => window.removeEventListener("eip6963:announceProvider", handler);
}

/** The un-announced window.ethereum, offered as what it is, only when nothing announced. */
export function legacyProvider(): EIP6963ProviderDetail | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return {
    info: { uuid: LEGACY_RDNS, name: "The wallet in this browser", icon: "", rdns: LEGACY_RDNS },
    provider: window.ethereum,
  };
}

export const rememberWallet = (rdns: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, rdns);
  } catch {
    /* storage may be blocked; the site still works, it just asks again next time */
  }
};
export const forgetWallet = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
export const rememberedWallet = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

type ProviderError = { code?: number; message?: string };
const errCode = (e: unknown) => (e && typeof e === "object" ? (e as ProviderError).code : undefined);
const errMsg = (e: unknown) =>
  e && typeof e === "object" && (e as ProviderError).message
    ? String((e as ProviderError).message)
    : String(e);

/** 4001: the wallet's own "no". An answer, not a failure. */
export const isUserRejection = (e: unknown) =>
  errCode(e) === 4001 || /user rejected|user denied|rejected the request/i.test(errMsg(e));

export async function getChainId(p: EIP1193Provider): Promise<number | null> {
  try {
    const hex = (await p.request({ method: "eth_chainId" })) as string;
    const n = parseInt(hex, 16);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

/** wallet_switchEthereumChain to Studio; 4902 (unknown chain) → wallet_addEthereumChain. */
export async function switchToStudio(p: EIP1193Provider): Promise<void> {
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e) {
    const code = errCode(e);
    const msg = errMsg(e);
    if (code === 4902 || /unrecognized|not added|unknown chain|4902/i.test(msg)) {
      await p.request({ method: "wallet_addEthereumChain", params: [STUDIO_CHAIN_PARAMS] });
      return;
    }
    throw e;
  }
}

/** eth_requestAccounts: the wallet asks the reader. Lowercase address or "". */
export async function requestAccount(p: EIP1193Provider): Promise<string> {
  const a = (await p.request({ method: "eth_requestAccounts" })) as string[];
  return a?.[0] ? a[0].toLowerCase() : "";
}

/** eth_accounts: no prompt; "" when the wallet no longer exposes an account to this site. */
export async function silentAccount(p: EIP1193Provider): Promise<string> {
  try {
    const a = (await p.request({ method: "eth_accounts" })) as string[];
    return a?.[0] ? a[0].toLowerCase() : "";
  } catch {
    return "";
  }
}

/** Best effort: wallets that honour it drop the site's permission; the rest refuse. */
export async function revokePermissions(p: EIP1193Provider): Promise<void> {
  try {
    await p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    /* the page has forgotten the address either way */
  }
}

/** personal_sign [message, address] through the wallet. */
export async function personalSign(p: EIP1193Provider, address: string, message: string): Promise<string> {
  const sig = await p.request({ method: "personal_sign", params: [message, address] });
  return String(sig);
}

// ---- the signer registry -------------------------------------------------
// lib/chain.ts has no React state; the WalletProvider tells this module who is connected
// and chain.write() reads it here. One signer per page.

export type Signer = { provider: EIP1193Provider; address: string; rdns: string };
let current: Signer | null = null;

export const setSigner = (s: Signer | null) => {
  current = s;
};
export const getSigner = (): Signer | null => current;

// ---- small formatters used by the wallet UI --------------------------------

export const shortAddress = (a: string) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

/** "12.3 GEN": up to three decimals, trailing zeros dropped. */
export function formatGen(atto: bigint, decimals = 3): string {
  const neg = atto < 0n;
  const v = neg ? -atto : atto;
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""} GEN`;
}

export const chainName = (id: number | null) => {
  if (id === null) return "an unknown network";
  if (id === CHAIN_ID) return "GenLayer Studio";
  const known: Record<number, string> = {
    1: "Ethereum mainnet",
    11155111: "Sepolia",
    8453: "Base",
    137: "Polygon",
    42161: "Arbitrum One",
    10: "Optimism",
    56: "BNB Chain",
    61997: "GenLayer Studio Next",
  };
  return known[id] ?? `chain ${id}`;
};
