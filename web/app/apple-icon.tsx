import { ImageResponse } from "next/og";

import { markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The app icon: the paw in its house, on a cream tile with a sage rim.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#FBF7EC", border: "10px solid #A3B18A" }}>
        <img src={markDataUri({ size: 136 })} width={136} height={136} alt="" />
      </div>
    ),
    size,
  );
}
