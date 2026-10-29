/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-cp-portal-dev' : '.next-cp-portal',
};

module.exports = nextConfig;
