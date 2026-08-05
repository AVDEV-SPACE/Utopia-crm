import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getUserRole } from '@/actions/auth';

const isPublicRoute = createRouteMatcher([
  '/',
  '/auth/sign-in(.*)',
  '/auth/sign-up(.*)',
  '/api/webhooks/clerk(.*)',
  '/api/check-authorization(.*)',
  '/api/setup(.*)',
]);

const isAssistantRoute = createRouteMatcher(['/appointments(.*)']);

const isProtectedRoute = createRouteMatcher([
  '/overview(.*)',
  '/appointments(.*)',
  '/settings(.*)',
  '/dashboard(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn } = await auth();
  const pathname = req.nextUrl.pathname;

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  if (!userId) {
    const signInUrl = new URL('/auth/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isProtectedRoute(req)) {
    try {
      const role = await getUserRole(userId);

      if (role === 'assistant') {
        if (!isAssistantRoute(req)) {
          return NextResponse.redirect(new URL('/appointments', req.url));
        }
      }

      return NextResponse.next();
    } catch (error) {
      console.error('Middleware error - getUserRole failed:', error);
      const signInUrl = new URL('/auth/sign-in', req.url);
      signInUrl.searchParams.set('error', 'auth_error');
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
    '/',
  ],
};