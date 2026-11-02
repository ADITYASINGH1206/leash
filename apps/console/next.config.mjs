/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@leash/shared', '@leash/mandates'],
  experimental: {
    // optimize package imports for fast loading
    optimizePackageImports: ['lucide-react', 'ag-grid-react'],
  },
};

export default nextConfig;

