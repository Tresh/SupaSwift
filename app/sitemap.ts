import type { MetadataRoute } from "next";

const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
