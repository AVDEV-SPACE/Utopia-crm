// src/app/api/educational-templates/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const service = searchParams.get('service');

    let query = sql`SELECT * FROM educational_templates WHERE created_by = ${userId}`;
    if (service) {
      query = sql`SELECT * FROM educational_templates WHERE created_by = ${userId} AND service = ${service}`;
    }

    const templates = await query;
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { title, content, service, case_type } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Missing required fields: title and content' }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO educational_templates (title, content, service, case_type, created_by)
      VALUES (${title}, ${content}, ${service || null}, ${case_type || null}, ${userId})
      RETURNING *
    `;

    console.log('Template created:', result[0]);
    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, title, content, service, case_type } = body;

    if (!id || !title || !content) {
      return NextResponse.json({ error: 'Missing required fields: id, title, content' }, { status: 400 });
    }

    const result = await sql`
      UPDATE educational_templates
      SET title = ${title}, content = ${content}, service = ${service || null},
          case_type = ${case_type || null}, updated_at = NOW()
      WHERE id = ${id} AND created_by = ${userId}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error updating template:', error);
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
      DELETE FROM educational_templates
      WHERE id = ${id} AND created_by = ${userId} AND is_default = false
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}