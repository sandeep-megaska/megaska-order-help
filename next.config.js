/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // App Proxy: /proxy → /api/proxy  (NO redirect, only internal rewrite)
  async rewrites() {
    return [
      {
        source: '/proxy',
        destination: '/api/proxy',
      },
    ];
  },

  // No redirects from /proxy → /proxy/ etc.
};

module.exports = nextConfig;
