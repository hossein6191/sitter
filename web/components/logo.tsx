// The header's mark and name: the paw inside a house (lib/mark.ts), and "Sitter" written by hand.

import { markSvg } from "@/lib/mark";

export function Mark({ size = 40 }: { size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: markSvg({ size }) }} />;
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <Mark size={40} />
      <span className="hand text-[2.2rem] leading-none font-bold text-plum-deep">Sitter</span>
    </span>
  );
}
