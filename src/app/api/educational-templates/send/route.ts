import { NextRequest } from 'next/server';
import { POST as messagingSend } from '@/app/api/messaging/send/route';

export const dynamic = 'force-dynamic';

// Delegate la /api/messaging/send — aceeași logică
export const POST = (req: NextRequest) => messagingSend(req);
