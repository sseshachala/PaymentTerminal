import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Fail build if type errors
  typescript: { ignoreBuildErrors: false },
  // Prevent exposing server internals
  poweredByHeader: false,
  // Only allow same-origin cross-origin requests
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
}

export default nextConfig
