/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Treat @defensivepedal/core (file:../../packages/core workspace link) as app-local source.
  // Without this, Next.js follows the symlink to its real path and walks up for transitive
  // deps (zod) from packages/core/, where there's no node_modules on Vercel since vercel.json
  // sets installCommand=--workspaces=false and only installs apps/web's deps.
  transpilePackages: ['@defensivepedal/core'],
  // Apple's AASA validator follows 301/308 redirects as "failed" — never redirect trailing slashes.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        // Force application/json on every file under /.well-known/*.
        // Covers both `assetlinks.json` AND `apple-app-site-association` (no extension —
        // Next.js would otherwise serve it as text/plain, which Apple's validator rejects).
        source: '/.well-known/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' },
        ],
      },
      {
        // Route-share pages must not be indexed — defence-in-depth beside the
        // <meta name="robots"> tag (matches PRD user story #38).
        source: '/r/:code*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

module.exports = nextConfig;
