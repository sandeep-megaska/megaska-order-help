/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/proxy',
        destination: '/api/proxy'
      }
    ];
  }
};

module.exports = nextConfig;
