/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/render': ['node_modules/@sparticuz/chromium/bin/**'],
  },
};

module.exports = nextConfig;