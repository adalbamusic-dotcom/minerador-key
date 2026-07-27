import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path((?!_next/static|_next/image|favicon.ico).*)", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ] }];
  },
};

export default nextConfig;
