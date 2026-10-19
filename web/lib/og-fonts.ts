// Caveat and Nunito for the share card, fetched from Google Fonts when the card is built and cut down to
// the characters it prints. If the fetch fails the card is still built, in the renderer's own font.

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" };

async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!resource) throw new Error("no font in the stylesheet");
  const res = await fetch(resource[1]);
  if (res.status !== 200) throw new Error("font fetch failed");
  return res.arrayBuffer();
}

export async function diaryFonts(text: string): Promise<Font[]> {
  try {
    const [hand, body] = await Promise.all([loadGoogleFont("Caveat", 700, text), loadGoogleFont("Nunito", 700, text)]);
    return [
      { name: "Caveat", data: hand, weight: 700, style: "normal" },
      { name: "Nunito", data: body, weight: 700, style: "normal" },
    ];
  } catch {
    return [];
  }
}
