import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This repo is handed to the studio; no AI tooling files in the tree.
  agentRules: false,
  // PGlite ships a WebAssembly build that must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Every width is pre-rendered by scripts/build-assets.mjs, so the server
  // needs no native image binding at runtime — which is just as well, since
  // this machine blocks unsigned native bindings.
  images: { unoptimized: true },
  // Opening the dev server on 127.0.0.1 rather than localhost otherwise loads
  // the HTML but never hydrates, and the page looks dead with a clean console.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
      {
        // Fonts and generated media are content-addressed by build, never edited
        // in place, and are the largest thing on the page.
        source: '/:dir(fonts|media)/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default config;
