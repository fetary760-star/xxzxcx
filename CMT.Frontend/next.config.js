/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // SECURITY FIX (Information Disclosure via Server Response Headers):
  // Disable the "X-Powered-By: Next.js" response header so that the
  // front-end framework and its version are not advertised to clients.
  poweredByHeader: false,

  // Essential for IIS deployment
  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true, // Required for static export and IIS
  },
  
  // ------------------------------------------------------------------
  // Security Headers Configuration
  // ------------------------------------------------------------------
  // SECURITY FIX (CSP Hardening):
  //   The Content-Security-Policy is now emitted from middleware.ts on a
  //   per-request basis with a cryptographically random nonce instead of
  //   being defined statically here. That removes the previous
  //   'unsafe-inline' / 'unsafe-eval' allowances which weakened the CSP.
  //
  //   Only non-nonce-dependent, request-independent security headers
  //   remain in this static configuration. The CSP itself, along with
  //   Cache-Control for sensitive paths, is applied in middleware.ts.
  // ------------------------------------------------------------------
  async headers() {
        const baseSecurityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // SECURITY FIX (Information Disclosure): overwrite any Server /
      // X-Powered-By header that IIS / iisnode / ASP.NET may have added
      // upstream with an empty value so the technology stack is hidden.
      { key: 'Server', value: '' },
      { key: 'X-Powered-By', value: '' },
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=()'
      },
      // --------------------------------------------------------------
      // SECURITY FIX (HSTS - HTTP Strict Transport Security):
      // Instruct browsers to only communicate with this origin over
      // HTTPS for the next 1 year, including all subdomains, and allow
      // preload list submission.
      //
      // NOTE: Per RFC 6797, browsers ignore this header over plain
      // HTTP, so sending it unconditionally is safe. Ensure the site
      // is fully reachable over HTTPS before enabling preload.
      // --------------------------------------------------------------
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload'
      }
      // NOTE: Content-Security-Policy intentionally NOT set here.
      // It is emitted per-request with a nonce by middleware.ts.
    ];

    return [
      {
        source: '/:path*',
        headers: baseSecurityHeaders
      }
    ];
  },

  // Rewrites to proxy requests to backend
  async rewrites() {
    // FIX: trim any accidental whitespace from env vars (previous default had a leading space
    // which produced an invalid URL like " http://localhost:5000/api" and broke the /uploads proxy).
    const rawBackendUrl = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').trim()
    // Extract base URL without /api suffix
    const backendBaseUrl = rawBackendUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')

    return [
      {
        // Proxy /uploads/* requests to backend server (where wwwroot/uploads lives)
        source: '/uploads/:path*',
        destination: `${backendBaseUrl}/uploads/:path*`
      }
    ]
  },

  // Environment variables (trimmed to avoid leading/trailing whitespace bugs)
  env: {
    NEXT_PUBLIC_API_BASE_URL: (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').trim(),
    CMT_API_BASE_URL: (process.env.CMT_API_BASE_URL || 'http://localhost:5000/api').trim()
  },

  // Image optimization - configured for IIS
  images: {
    unoptimized: true,
    domains: ['svhqiis03'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.ethiopianairlines.com'
      },
      {
        protocol: 'http',
        hostname: 'svhqiis03'
      }
    ]
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false
      }
    }
    return config
  }
}

module.exports = nextConfig