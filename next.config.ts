import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path((?!_next/static|_next/image|favicon.ico).*)", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ] }];
  },
  async rewrites() {
    // OAuth protected resource metadata (RFC 9728) do MCP do Redator. A URL
    // pública permanece `/.well-known/...`; o handler vive sob `/api/oauth`.
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/api/mcp/redator", destination: "/api/oauth/protected-resource/api/mcp/redator" },
    ];
  },
};

export default nextConfig;
