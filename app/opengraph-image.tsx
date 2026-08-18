import { ImageResponse } from "next/og";
import { BOLT_PATH } from "@/components/logo";

export const alt = "SupaSwift: Keep your Supabase projects awake";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <svg viewBox="0 0 32 32" style={{ width: 150, height: 150 }}>
          <path d={BOLT_PATH} fill="#059669" />
        </svg>
        <div
          style={{
            marginTop: 12,
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#18181b",
          }}
        >
          SupaSwift
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 34,
            color: "#52525b",
          }}
        >
          Keep your Supabase projects awake.
        </div>
      </div>
    ),
    size
  );
}
