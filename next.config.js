/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/proxy',
        destination: '/api/proxy',
      },
    ];
  },
  // IMPORTANT: no redirects from /proxy → /proxy/ or similar
};

module.exports = nextConfig;
