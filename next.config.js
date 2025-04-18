/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // This is experimental but allows for custom document in compatibility with static export
    optimizeFonts: true,
  },
  // Ensure Next.js doesn't attempt to render pages on the server during export
  target: 'serverless',
};

module.exports = nextConfig; 