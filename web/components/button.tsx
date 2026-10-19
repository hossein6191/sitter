// Sticker buttons: a die-cut round sticker with a white edge and a soft shadow that presses down when
// pushed. Plum for the one thing to do, sage for a second choice, paper for the quiet ones, brick for
// giving something up.

import Link from "next/link";
import * as React from "react";

type Variant = "plum" | "sage" | "paper" | "brick";
type Common = { variant?: Variant; size?: "md" | "sm"; block?: boolean; icon?: React.ReactNode; className?: string; children: React.ReactNode };

export function Sticker({ variant = "plum", size = "md", block, icon, className, children, ...rest }: Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type="button" data-variant={variant} data-size={size} data-block={block ? "true" : undefined} className={"sticker-btn " + (className ?? "")} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function StickerLink({ variant = "plum", size = "md", block, icon, className, children, href }: Common & { href: string }) {
  return (
    <Link href={href} data-variant={variant} data-size={size} data-block={block ? "true" : undefined} className={"sticker-btn " + (className ?? "")}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
