import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SupaSwift: Keep your Supabase projects awake",
    short_name: "SupaSwift",
    description:
      "SupaSwift quietly checks your Supabase projects, monitors their health, and lets you know when something needs attention.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
