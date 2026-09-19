import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Trade chart screenshots are submitted as a compressed base64 data URI
    // through the createTrade/updateTrade server actions (see
    // ChartImageInput.tsx) rather than a separate file-upload endpoint, so
    // the default 1MB server action body limit needs headroom for that plus
    // the rest of the form fields. Also covers the tax PDF importer's
    // base64-encoded upload (see extractPdfTransactions in actions/tax.ts) —
    // a 4MB PDF is ~5.4MB over the wire, hence 8mb rather than 6mb.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
