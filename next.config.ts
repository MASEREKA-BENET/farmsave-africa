import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve("."),
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    const storageOrigins: string[] = [];
    if (process.env.S3_ENDPOINT) { try { storageOrigins.push(new URL(process.env.S3_ENDPOINT).origin); } catch { /* Setup checker reports malformed storage endpoints. */ } }
    if (process.env.S3_REGION && /^[a-z0-9-]+$/.test(process.env.S3_REGION)) {
      storageOrigins.push(`https://s3.${process.env.S3_REGION}.amazonaws.com`);
      if (process.env.S3_BUCKET && /^[a-z0-9.-]+$/.test(process.env.S3_BUCKET)) storageOrigins.push(`https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`);
    }
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${storageOrigins.join(" ")}; font-src 'self'; connect-src 'self' ${storageOrigins.join(" ")}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` }
    ] }];
  }
};
export default config;
