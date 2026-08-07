/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Cover art is rendered directly and the app does not use next/image. Keep
  // the optimizer route disabled so image-proxy cannot feed untrusted bytes
  // into the native sharp/libvips decoder bundled by Next.js.
  images: {
    unoptimized: true
  },
  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join("; ");
    const immutableCache = "public, max-age=31536000, immutable";
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: immutableCache }]
      },
      {
        // Query-string content hashes in globals.css keep these full, unmodified
        // fonts cacheable without subsetting or risking stale glyph data.
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: immutableCache }]
      },
      {
        source: "/app-icon.png",
        headers: [{ key: "Cache-Control", value: immutableCache }]
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), display-capture=(), usb=(), serial=(), hid=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" }
        ]
      }
    ];
  }
};

export default nextConfig;
