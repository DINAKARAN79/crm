/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@dct-crm/db', '@dct-crm/shared'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "frame-src 'self' https://bizcall.cxteletech.com",
        },
        {
          key: 'Permissions-Policy',
          value: 'microphone=(self "https://bizcall.cxteletech.com")',
        },
      ],
    }];
  },
};

module.exports = nextConfig;
