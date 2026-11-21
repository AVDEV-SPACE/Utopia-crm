// src/app/api/health/ready/route.ts — dependențele CRM-ului (vezi lib/health.ts)

import { healthResponse, isHealthAuthorized, HealthCheck } from '@/lib/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Importurile sunt în interiorul verificărilor: un modul care cade la încărcare
// (ex. neon-server fără DATABASE_URL) devine o verificare `fail`, nu un 500 opac.
const database: HealthCheck = {
  critical: true,
  timeoutMs: 3_000,
  async run() {
    const { sql } = await import('@/lib/neon-server');
    await sql`SELECT 1`;
  },
};

const DEEP_CHECKS: Record<string, HealthCheck> = {
  database,
  // Fără Clerk nu se mai poate loga nimeni în CRM
  clerk: {
    critical: true,
    async run() {
      const res = await fetch('https://api.clerk.com/v1/users?limit=1', {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Clerk ${res.status}`);
    },
  },
  // Căsuța din care pleacă outreach-ul și mesajele din CRM
  email: {
    critical: false,
    async run() {
      const [{ default: nodemailer }, { mailboxCredentials }] = await Promise.all([
        import('nodemailer'), import('@/lib/messaging'),
      ]);
      const auth = mailboxCredentials();
      if (!auth.pass) throw new Error('parola de aplicație Gmail lipsește');
      await nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth }).verify();
    },
  },
  twilio: {
    critical: false,
    async run() {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) return 'neconfigurat';
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}`);
      const { status } = await res.json();
      if (status !== 'active') throw new Error(`cont Twilio ${status}`);
    },
  },
};

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.has('deep');
  if (deep && !isHealthAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return healthResponse('utopia-crm', deep ? DEEP_CHECKS : { database });
}
