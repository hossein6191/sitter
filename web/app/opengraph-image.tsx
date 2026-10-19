import { ImageResponse } from "next/og";

import { diaryFonts } from "@/lib/og-fonts";
import { CREAM, PAW, PLUM, PLUM_DEEP, SAGE, markDataUri } from "@/lib/mark";

export const alt = "Sitter: pet and house sitting paid day by day. Each day's report is read against every care instruction, and the day is paid for what it shows done.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "Sitter";
const LINE = "Paid day by day, for what the report shows done.";
const SUB = "Validators read each evening's report against every care instruction.";
const DAYS = [
  { day: "Day 1", sticker: "ALL DONE", bg: PAW, ink: "#fff", note: "fed her twice, the pill, water, ferns" },
  { day: "Day 2", sticker: "4/5", bg: "#E3A93B", ink: "#3d2700", note: "forgot her heart pill, sorry" },
  { day: "Day 3", sticker: "UNCLEAR", bg: "#B8B3A9", ink: "#2e2a25", note: "all fine, she is purring!" },
];
const LIST = ["Feed Biscuit her morning meal", "Feed Biscuit her evening meal", "Give Biscuit her heart pill"];

// The share card: a cream diary page on the sage desk, with its spiral and margin, the promise written by
// hand, three day squares with their stickers, and a checklist ticking itself.
export default async function OpenGraphImage() {
  const fonts = await diaryFonts(TITLE + LINE + SUB + DAYS.map((d) => d.day + d.sticker + d.note).join("") + LIST.join("") + "GenLayer Intelligent Contract Studio·0123456789/");
  const hand = fonts.length ? "Caveat" : "serif";
  const body = fonts.length ? "Nunito" : "sans-serif";
  const rings = Array.from({ length: 15 }, (_, i) => 40 + i * 38);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: SAGE, padding: 34, fontFamily: body }}>
        <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", backgroundColor: CREAM, borderRadius: "8px 26px 26px 8px", paddingLeft: 92 }}>
          {rings.map((y) => (
            <div key={y} style={{ position: "absolute", left: 22, top: y, width: 14, height: 14, borderRadius: 7, backgroundColor: "#4a443c" }} />
          ))}
          {rings.map((y) => (
            <div key={"c" + y} style={{ position: "absolute", left: -18, top: y - 6, width: 46, height: 8, borderRadius: 4, backgroundColor: "#9a958b", transform: "rotate(-12deg)" }} />
          ))}
          <div style={{ position: "absolute", left: 70, top: 0, bottom: 0, width: 3, backgroundColor: "#DCC0D0" }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 520, paddingRight: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src={markDataUri({ size: 84 })} width={84} height={84} alt="" />
              <div style={{ fontFamily: hand, fontSize: 92, fontWeight: 700, color: PLUM_DEEP, lineHeight: 1 }}>{TITLE}</div>
            </div>
            <div style={{ marginTop: 26, fontFamily: hand, fontSize: 60, fontWeight: 700, lineHeight: 1.02, color: PLUM }}>{LINE}</div>
            <div style={{ marginTop: 20, fontSize: 25, color: "#58505e", lineHeight: 1.35 }}>{SUB}</div>
            <div style={{ display: "flex", marginTop: 26, fontSize: 19, color: "#58505e", border: "2px dashed #C9BEA4", borderRadius: 999, padding: "6px 16px", alignSelf: "flex-start" }}>
              GenLayer Intelligent Contract · Studio
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
            <div style={{ display: "flex", gap: 14 }}>
              {DAYS.map((d) => (
                <div key={d.day} style={{ display: "flex", flexDirection: "column", position: "relative", width: 168, height: 190, backgroundColor: "#FFFDF7", border: "3px dashed #C9BEA4", borderRadius: 14, padding: "12px 12px" }}>
                  <div style={{ fontFamily: hand, fontSize: 38, fontWeight: 700, color: PLUM_DEEP, lineHeight: 1 }}>{d.day}</div>
                  <div style={{ fontFamily: hand, fontSize: 25, color: "#2f2a33", marginTop: 14, lineHeight: 1.1 }}>{`"${d.note}"`}</div>
                  <div
                    style={{
                      position: "absolute",
                      right: -16,
                      top: -16,
                      width: 78,
                      height: 78,
                      borderRadius: 39,
                      border: "4px solid #fff",
                      backgroundColor: d.bg,
                      color: d.ink,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: d.sticker.length > 4 ? 13 : 22,
                      fontWeight: 700,
                      transform: "rotate(-10deg)",
                    }}
                  >
                    {d.sticker}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, backgroundColor: "#FFFDF7", border: "2px solid #E5DCC7", borderRadius: 14, padding: "14px 18px", width: 532 }}>
              {LIST.map((item, i) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 23, color: i === 2 ? "#847b89" : "#2f2a33" }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      border: `3px solid ${i === 2 ? "#C9BEA4" : PLUM}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: PLUM,
                      fontSize: 20,
                      fontWeight: 700,
                    }}
                  >
                    {i === 2 ? null : (
                      <svg width="18" height="18" viewBox="0 0 16 16">
                        <path d="M3 8.6 6.6 12 13 4" fill="none" stroke={PLUM} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
