import { sql } from '@/lib/neon';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // crm_users — utilizatori CRM (sync din Clerk)
    await sql`
      CREATE TABLE IF NOT EXISTS crm_users (
        id          SERIAL PRIMARY KEY,
        clerk_id    TEXT UNIQUE NOT NULL,
        fullname    TEXT NOT NULL,
        email       TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'owner',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // educational_templates — șabloane email follow-up
    await sql`
      CREATE TABLE IF NOT EXISTS educational_templates (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        content     TEXT NOT NULL,
        service     TEXT,
        is_default  BOOLEAN NOT NULL DEFAULT FALSE,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // scheduled_messages — mesaje programate
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id              SERIAL PRIMARY KEY,
        template_id     INTEGER NOT NULL REFERENCES educational_templates(id) ON DELETE CASCADE,
        service_filter  TEXT,
        time_filter     TEXT,
        recipient_ids   JSONB,
        scheduled_at    TIMESTAMPTZ NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'Tabele CRM create cu succes: crm_users, educational_templates, scheduled_messages',
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET — verifică dacă tabelele există
export async function GET() {
  const checks: Record<string, boolean> = {};
  for (const table of ['crm_users', 'educational_templates', 'scheduled_messages']) {
    try {
      await sql`SELECT 1 FROM ${sql.unsafe(table)} LIMIT 1`;
      checks[table] = true;
    } catch {
      checks[table] = false;
    }
  }
  const allExist = Object.values(checks).every(Boolean);
  return NextResponse.json({ ok: allExist, tables: checks });
}
