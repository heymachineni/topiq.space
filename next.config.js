/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Ensure compatibility with React Scripts config
  webpack: (config) => {
    config.resolve.fallback = { 
      ...config.resolve.fallback,
      fs: false, 
      path: false 
    };
    return config;
  },
}

module.exports = nextConfig 