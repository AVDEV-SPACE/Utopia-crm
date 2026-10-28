import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolveUserRole } from '@/lib/authorization';

const isPublicRoute = createRouteMatcher([
  '/',
  '/auth/sign-in(.*)',
  '/auth/sign-up(.*)',
  '/unauthorized',
  '/api/webhooks/clerk(.*)',
  // Verificarea allowlist-ului dinaintea înscrierii (formularul de sign-up)
  '/api/check-authorization(.*)',
  // Webhook Twilio — se autentifică prin orgId/apiKey + semnătură X-Twilio-Signature
  '/api/webhooks/unified(.*)',
  // Ingest de lead-uri din site — se autentifică prin apiKey în body.
  // Matcher exact: sub-rutele (/api/leads/scan, /api/leads/[id]) rămân protejate,
  // iar GET-ul de listare își verifică sesiunea în handler.
  '/api/leads',
  // Import generic în pipeline (CSV, unelte externe) — fiecare handler cere header-ul `x-api-key`
  // (sau `Authorization: Bearer`) egal cu CRM_PIPELINE_API_KEY (lib/pipeline-auth).
  // Matchere exacte: /api/pipeline/manage (folosit de UI) rămâne sub Clerk.
  '/api/pipeline/leads',
  '/api/pipeline/events',
  // Joburi programate (GitHub Actions) — fiecare handler cere
  // `Authorization: Bearer <CRON_SECRET>` (lib/cron-auth). Matchere exacte, câte unul pe job.
  '/api/cron/lead-discover',
  '/api/cron/lead-enrich',
]);

const isAssistantRoute = createRouteMatcher(['/appointments(.*)']);

const isProtectedRoute = createRouteMatcher([
  '/overview(.*)',
  '/appointments(.*)',
  '/settings(.*)',
  '/dashboard(.*)',
  '/pipeline(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;
  // API-urile răspund cu JSON; un redirect spre o pagină HTML ar fi interpretat greșit de fetch
  const isApi = pathname.startsWith('/api/');

  if (!userId) {
    if (isApi) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });
    const signInUrl = new URL('/auth/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Orice rută ne-publică (pagini ȘI API) cere un cont din allowlist — un cont
  // Clerk oarecare nu e suficient. La eroare, accesul se refuză (fail closed).
  let role: Awaited<ReturnType<typeof resolveUserRole>> = null;
  try {
    role = await resolveUserRole(userId);
  } catch (error) {
    console.error('Middleware: verificarea autorizării a eșuat:', error);
  }

  if (!role) {
    if (isApi) return NextResponse.json({ error: 'Acces neautorizat' }, { status: 403 });
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  if (role === 'assistant' && isProtectedRoute(req) && !isAssistantRoute(req)) {
    return NextResponse.redirect(new URL('/appointments', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Fișierele statice din /public (logo-uri, favicon-uri, fonturi) trebuie
    // excluse după extensie, nu doar `favicon.ico`: altfel middleware-ul le
    // redirecționează spre sign-in și rămân neîncărcate pentru vizitatorii
    // neautentificați (tab-ul browserului, pagina de login).
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf)$).*)',
    '/',
  ],
};