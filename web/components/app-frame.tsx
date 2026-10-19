"use client";

// The open diary every page is written in: the notebook page with its spiral and margin, the name and the
// wallet at the top, the pages of the site as words written along the top line (the current one circled
// in plum), and a footer under a torn line.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import { MockBar } from "@/components/mock-bar";
import { WalletButton, WrongChainBanner } from "@/components/wallet";
import { addressUrl, contractInUse, isMock } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";
import { cx } from "@/lib/cx";
import { short } from "@/lib/format";

const PAGES = [
  { href: "/book", label: "Book" },
  { href: "/mine", label: "My bookings" },
  { href: "/sitting", label: "Sitting" },
  { href: "/ledger", label: "Ledger" },
  { href: "/how", label: "How it works" },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const contract = contractInUse();
  return (
    <div className="mx-auto w-full max-w-[1120px] px-3 py-4 sm:px-6 sm:py-8">
      <div className="notebook">
        <header className="relative z-[1] flex flex-col gap-2 border-b-2 border-rule px-3 pt-4 pb-3 sm:px-6">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Link href="/" aria-label="Sitter, the first page" className="min-w-0 shrink-0">
              <Logo />
            </Link>
            {!isMock && <WalletButton />}
          </div>
          <nav aria-label="Pages" className="flex flex-wrap gap-x-1 gap-y-1">
            {PAGES.map((p) => {
              const on = path === p.href || (p.href !== "/" && path.startsWith(p.href));
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "hand rounded-[50%] border-2 px-2.5 py-0.5 text-[1.35rem] leading-tight font-bold",
                    on ? "-rotate-2 border-plum text-plum-deep" : "border-transparent text-ink-2 hover:text-plum-deep hover:underline",
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <div className="relative z-[1] flex flex-col gap-3 px-3 pt-3 sm:px-6">
          {isMock && <MockBar />}
          <WrongChainBanner />
        </div>
        <main id="main" className="relative z-[1] px-3 pt-5 pb-10 sm:px-6">
          {children}
        </main>
        <footer className="relative z-[1] border-t-2 border-dashed border-line-strong px-3 py-5 text-[0.82rem] text-ink-2 sm:px-6">
          <p>
            Sitter is an Intelligent Contract on GenLayer Studio (chain 61999), a test network: the GEN here is test GEN.
            {contract && (
              <>
                {" "}
                Contract{" "}
                <a className="mono link" href={addressUrl(contract)} target="_blank" rel="noreferrer">
                  {short(contract)}
                </a>
                .
              </>
            )}
            {REPO_URL && (
              <>
                {" "}
                <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
                  Source
                </a>
                .
              </>
            )}
          </p>
          <p className="mt-1 text-ink-3">Every pet, home, place and person on this site is made up. The network reads the sitter&apos;s words, never the home.</p>
        </footer>
      </div>
    </div>
  );
}
