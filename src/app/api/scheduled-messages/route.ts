// src/app/api/scheduled-messages/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const messages = await sql`
      SELECT sm.*, et.title as template_title
      FROM scheduled_messages sm
      JOIN educational_templates et ON sm.template_id = et.id
      WHERE sm.created_by = ${userId} AND sm.status = 'pending'
      ORDER BY sm.scheduled_at ASC
    `;

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching scheduled messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await sql`
      DELETE FROM scheduled_messages
      WHERE id = ${id} AND created_by = ${userId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scheduled message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}