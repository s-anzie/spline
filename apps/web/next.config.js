/** @type {import('next').NextConfig} */
import process from "node:process";

const nextConfig = {
  async rewrites() {
    return [{
      source: "/api/backend/:path*",
      destination: `${process.env.SPLINE_API_URL ?? "http://localhost:8765"}/:path*`,
    }];
  },
};

export default nextConfig;
