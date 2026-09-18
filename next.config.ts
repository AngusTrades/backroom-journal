import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Trade chart screenshots are submitted as a compressed base64 data URI
    // through the createTrade/updateTrade server actions (see
    // ChartImageInput.tsx) rather than a separate file-upload endpoint, so
    // the default 1MB server action body limit needs headroom for that plus
    // the rest of the form fields.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
