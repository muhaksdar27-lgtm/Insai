import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Add some simple request IDs or security tracking headers
  const response = NextResponse.next();
  
  // Set security headers to all API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // In a real app we'd also validate API keys here
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
};
