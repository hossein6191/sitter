// The Sitter mark: a paw print inside the outline of a house, drawn in plum and sage. One drawing, used
// by the header (components/logo.tsx), the browser icon (app/icon.svg), the app icon and the share card.

export const PLUM = "#6D597A";
export const PLUM_DEEP = "#4E3F58";
export const SAGE = "#A3B18A";
export const PAW = "#5E7B47";
export const CREAM = "#FBF7EC";

/** The mark as SVG markup on a 32-unit grid. `tile` draws it on a cream rounded square with a sage rim. */
export function markSvg({ size = 32, tile = false }: { size?: number; tile?: boolean } = {}): string {
  const back = tile ? `<rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8" fill="${CREAM}" stroke="${SAGE}" stroke-width="1.5"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    back +
    // the house: a roof line and three walls, one continuous outline
    `<path d="M4.5 15.2 L16 5 L27.5 15.2" fill="none" stroke="${PLUM}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M7.8 12.6 V25.6 Q7.8 27.4 9.6 27.4 H22.4 Q24.2 27.4 24.2 25.6 V12.6" fill="none" stroke="${PLUM}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    // the paw: one pad and four toes
    `<ellipse cx="16" cy="21.6" rx="3.7" ry="3.1" fill="${PAW}"/>` +
    `<ellipse cx="11.6" cy="17.6" rx="1.45" ry="1.75" transform="rotate(-24 11.6 17.6)" fill="${PAW}"/>` +
    `<ellipse cx="14.3" cy="15.1" rx="1.5" ry="1.85" transform="rotate(-8 14.3 15.1)" fill="${PAW}"/>` +
    `<ellipse cx="17.7" cy="15.1" rx="1.5" ry="1.85" transform="rotate(8 17.7 15.1)" fill="${PAW}"/>` +
    `<ellipse cx="20.4" cy="17.6" rx="1.45" ry="1.75" transform="rotate(24 20.4 17.6)" fill="${PAW}"/>` +
    `</svg>`
  );
}

/** The mark as a data URI, for next/og images. */
export const markDataUri = (opts: { size?: number; tile?: boolean } = {}): string => "data:image/svg+xml;base64," + Buffer.from(markSvg(opts)).toString("base64");
