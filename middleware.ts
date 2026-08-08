import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const res = NextResponse.next()

    // Security headers on every response
    res.headers.set('X-Frame-Options', 'DENY')
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'no-referrer')
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.headers.set('X-DNS-Prefetch-Control', 'off')
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
    res.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://js.stripe.com https://maps.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
        "frame-src https://js.stripe.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
        "connect-src 'self' https://api.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://connect.squareup.com https://pci-connect.squareup.com https://connect.squareupsandbox.com https://pci-connect.squareupsandbox.com",
        "img-src 'self' data: https: https://maps.gstatic.com https://maps.googleapis.com",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    )

    return res
  },
  {
    callbacks: {
      authorized({ token, req }) {
        const { pathname } = req.nextUrl
        // Public routes
        if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/api/auth') || pathname.startsWith('/api/register')) return true
        // Everything else requires auth
        return !!token
      },
    },
  }
)

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
