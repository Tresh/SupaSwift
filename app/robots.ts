import type { MetadataRoute } from "next";

const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private/authenticated areas and API routes - never crawl these.
      disallow: ["/api/", "/auth", "/dashboard", "/projects", "/settings"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
