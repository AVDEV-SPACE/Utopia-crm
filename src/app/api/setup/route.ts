import { sql } from '@/lib/neon';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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
        case_type   TEXT,
        is_default  BOOLEAN NOT NULL DEFAULT FALSE,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    // Tabelul poate exista deja fără coloană (vezi setup-db-template-case-types.sql)
    await sql`ALTER TABLE educational_templates ADD COLUMN IF NOT EXISTS case_type TEXT`;

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

    // sent_messages — jurnalul mesajelor/mail-urilor trimise
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await sql`
      CREATE TABLE IF NOT EXISTS sent_messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id          TEXT,
        sent_by         TEXT,
        channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
        recipient_type  TEXT NOT NULL DEFAULT 'client' CHECK (recipient_type IN ('lead', 'client')),
        lead_id         UUID,
        recipient_name  TEXT,
        recipient_email TEXT,
        recipient_phone TEXT,
        template_id     TEXT,
        template_title  TEXT,
        subject         TEXT,
        body            TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
        error           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sent_messages_org ON sent_messages (org_id, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sent_messages_lead ON sent_messages (lead_id) WHERE lead_id IS NOT NULL
    `;
    // Legătura cu Gmail + răspunsuri (vezi setup-db-sent-messages-replies.sql)
    await sql`ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS message_id TEXT`;
    await sql`ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ`;
    await sql`ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS reply_message_id TEXT`;
    await sql`ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS reply_subject TEXT`;
    await sql`ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS reply_snippet TEXT`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sent_messages_awaiting_reply ON sent_messages (org_id, created_at DESC)
      WHERE channel = 'email' AND status = 'sent' AND replied_at IS NULL
    `;

    // lead_notes — istoricul interacțiunilor pe lead
    await sql`
      CREATE TABLE IF NOT EXISTS lead_notes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id     UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
        org_id      TEXT,
        author_id   TEXT,
        author_name TEXT,
        kind        TEXT NOT NULL DEFAULT 'note'
                    CHECK (kind IN ('note', 'call', 'meeting', 'email', 'whatsapp', 'status')),
        body        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes (lead_id, created_at DESC)
    `;

    return NextResponse.json({
      success: true,
      message:
        'Tabele CRM create cu succes: crm_users, educational_templates, scheduled_messages, sent_messages, lead_notes',
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
