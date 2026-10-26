import type { NextConfig } from "next";

// Media bucket website endpoints: production and staging (infra apps/staging). One image serves both, and this
// file is evaluated at build time, so both hosts are listed.
const mediaHosts = ["media.bulbashenko.com", "media.bulbashenko.dev"];

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      `media-src 'self' ${mediaHosts.map((h) => `https://${h}`).join(" ")}`,
      "connect-src 'self' https://cloudflareinsights.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  htmlLimitedBots: /Telegrambot|vkShare|facebookexternalhit|Twitterbot|Slackbot|Discordbot|LinkedInBot|WhatsApp/i,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: mediaHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
};

export default nextConfig;
