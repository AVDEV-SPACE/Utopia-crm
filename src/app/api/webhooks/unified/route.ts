import { NextRequest, NextResponse } from 'next/server';
import { isSmsConfigured, isWhatsAppConfigured, sendSMS, sendWhatsApp } from '@/lib/messaging';
import {
  isValidTwilioSignature,
  signatureValidationEnabled,
  signedUrlFor,
} from '@/lib/twilio-signature';
import { createAutomationLead } from '@/services/leads/repository';
import { generateConversationReply, generateMissedCallSms } from '@/services/followups/ai';
import {
  appendMessage,
  getOrCreateConversation,
  getRecentMessages,
  isHumanHandling,
  normalizePhone,
} from '@/services/followups/conversations';
import { getSettingsByApiKey, getSettingsByOrgId } from '@/services/followups/settings';
import {
  ConversationChannel,
  DEFAULT_WHATSAPP_SYSTEM_PROMPT,
  MISSED_CALL_STATUSES,
  OrganizationSettings,
  TwilioWebhookPayload,
} from '@/services/followups/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Webhook unificat Twilio: același URL primește și status callback-urile de
 * voce (apel pierdut → SMS automat), și mesajele WhatsApp/SMS primite
 * (→ auto-reply AI). Organizația se identifică prin `?orgId=` sau prin API key.
 *
 * Twilio se așteaptă la TwiML; răspundem cu un `<Response/>` gol pentru că
 * mesajele le trimitem prin REST API, nu prin TwiML.
 */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): NextResponse {
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Twilio postează form-urlencoded; acceptăm și JSON pentru teste/integrări. */
async function parsePayload(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const json: unknown = await req.json().catch(() => ({}));
    if (!json || typeof json !== 'object') return {};
    return Object.fromEntries(
      Object.entries(json as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * API key din header/query (secret), sau orgId din query/body. `byApiKey`
 * spune dacă requestul și-a dovedit identitatea cu un secret: orgId-ul nu e
 * secret, deci singur nu autentifică nimic.
 */
async function resolveSettings(
  req: NextRequest,
  raw: Record<string, string>
): Promise<{ settings: OrganizationSettings | null; byApiKey: boolean }> {
  const url = new URL(req.url);

  const apiKey =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    url.searchParams.get('apiKey') ??
    raw.apiKey ??
    null;
  if (apiKey) return { settings: await getSettingsByApiKey(apiKey), byApiKey: true };

  const orgId = url.searchParams.get('orgId') ?? raw.orgId ?? null;
  if (orgId) return { settings: await getSettingsByOrgId(orgId), byApiKey: false };

  return { settings: null, byApiKey: false };
}

export async function POST(req: NextRequest) {
  try {
    const raw = await parsePayload(req);
    const payload = raw as TwilioWebhookPayload;

    const { settings, byApiKey } = await resolveSettings(req, raw);
    if (!settings) {
      console.warn('[webhooks/unified] organizație negăsită pentru request');
      return NextResponse.json(
        { error: 'orgId sau apiKey lipsă/invalid' },
        { status: 401 }
      );
    }

    // Semnătura se validează după ce știm organizația, dar înainte de orice
    // efect (SMS trimis, lead creat). Fără API key, orgId-ul public nu dovedește
    // nimic — atunci semnătura Twilio e obligatorie, indiferent de flag; altfel
    // oricine ar putea declanșa SMS-uri și crea lead-uri în numele organizației.
    if (!byApiKey || signatureValidationEnabled()) {
      const signature = req.headers.get('x-twilio-signature');
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!signature || !authToken) {
        console.warn('[webhooks/unified] semnătură Twilio lipsă');
        return NextResponse.json({ error: 'Semnătură invalidă' }, { status: 403 });
      }
      const valid = isValidTwilioSignature({
        authToken,
        signature,
        url: signedUrlFor(req.url),
        params: raw,
      });
      if (!valid) {
        console.warn('[webhooks/unified] semnătură Twilio invalidă');
        return NextResponse.json({ error: 'Semnătură invalidă' }, { status: 403 });
      }
    }

    // A. Status callback de voce → apel pierdut
    if (payload.CallStatus) {
      return handleCallStatus(payload, settings);
    }

    // B. Mesaj primit (WhatsApp sau SMS)
    if (payload.WaId || payload.MessageSid || payload.SmsSid) {
      return handleIncomingMessage(payload, settings);
    }

    console.warn('[webhooks/unified] payload nerecunoscut:', Object.keys(raw).join(', '));
    return twiml();
  } catch (error) {
    // Nu returnăm 500 către Twilio: ar declanșa retry-uri repetate pentru un
    // eveniment pe care oricum nu-l putem procesa. Logăm și confirmăm.
    console.error('[webhooks/unified] eroare neașteptată:', error);
    return twiml();
  }
}

/** Twilio face și un GET de verificare când salvezi URL-ul în consolă. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'unified-webhook' });
}

// ── A. Apel pierdut → SMS automat ──────────────────────────────────────────
async function handleCallStatus(
  payload: TwilioWebhookPayload,
  settings: OrganizationSettings
): Promise<NextResponse> {
  const status = (payload.CallStatus ?? '').toLowerCase();
  if (!MISSED_CALL_STATUSES.includes(status as (typeof MISSED_CALL_STATUSES)[number])) {
    return twiml();
  }

  const caller = payload.From ? normalizePhone(payload.From) : '';
  if (!caller) {
    console.warn('[webhooks/unified] apel pierdut fără câmpul From');
    return twiml();
  }

  // Lead-ul se creează întâi: `source_ref = CallSid` e cheia de idempotență,
  // deci un retry Twilio nu mai trimite al doilea SMS.
  const lead = await createAutomationLead({
    org_id: settings.org_id,
    company_name: `Apel pierdut ${caller}`,
    contact_phone: caller,
    status: 'MISSED_CALL',
    source: 'missed_call',
    source_ref: payload.CallSid ?? null,
    notes: `Apel pierdut (${status}) către ${payload.To ?? 'număr necunoscut'}.`,
  });

  if (!lead) {
    console.log(`[webhooks/unified] apel ${payload.CallSid} deja procesat — ignorat`);
    return twiml();
  }

  if (!settings.missed_call_sms_enabled) {
    console.log('[webhooks/unified] SMS apel pierdut dezactivat — lead salvat, SMS omis');
    return twiml();
  }

  if (!isSmsConfigured()) {
    console.error('[webhooks/unified] SMS neconfigurat (TWILIO_* lipsă) — SMS omis');
    return twiml();
  }

  try {
    const configured = settings.missed_call_sms_message.trim();
    const body = configured || (await generateMissedCallSms({ callerPhone: caller }));
    await sendSMS(caller, body);
  } catch (error) {
    // Lead-ul e deja salvat — eșecul SMS-ului nu trebuie să-l piardă.
    console.error('[webhooks/unified] SMS apel pierdut eșuat:', error);
  }

  return twiml();
}

// ── B. Mesaj primit → auto-reply AI ────────────────────────────────────────
async function handleIncomingMessage(
  payload: TwilioWebhookPayload,
  settings: OrganizationSettings
): Promise<NextResponse> {
  const from = payload.From ?? '';
  if (!from) {
    console.warn('[webhooks/unified] mesaj fără câmpul From');
    return twiml();
  }

  const channel: ConversationChannel =
    payload.WaId || from.toLowerCase().startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  const body = (payload.Body ?? '').trim();
  const twilioSid = payload.MessageSid ?? payload.SmsSid ?? null;

  const conversation = await getOrCreateConversation({
    orgId: settings.org_id,
    channel,
    contactPhone: from,
    waId: payload.WaId ?? null,
    contactName: payload.ProfileName ?? null,
  });

  // Mesaje fără text (doar media) se logează, dar nu au ce trimite la AI.
  const logged = await appendMessage({
    conversationId: conversation.id,
    role: 'user',
    body: body || '[mesaj fără text]',
    twilioSid,
  });

  if (!logged) {
    console.log(`[webhooks/unified] mesajul ${twilioSid} a fost deja procesat — ignorat`);
    return twiml();
  }

  if (!settings.whatsapp_ai_enabled) {
    console.log('[webhooks/unified] auto-reply AI dezactivat — mesaj doar logat');
    return twiml();
  }

  if (!body) {
    console.log('[webhooks/unified] mesaj fără text — fără răspuns AI');
    return twiml();
  }

  // Un operator uman a preluat conversația în fereastra configurată → AI-ul tace.
  if (isHumanHandling(conversation, settings.human_takeover_minutes)) {
    console.log(
      `[webhooks/unified] conversația ${conversation.id} e preluată de un agent uman — AI oprit`
    );
    return twiml();
  }

  const configured = channel === 'whatsapp' ? isWhatsAppConfigured() : isSmsConfigured();
  if (!configured) {
    console.error(`[webhooks/unified] canalul ${channel} nu e configurat — răspuns omis`);
    return twiml();
  }

  try {
    const history = await getRecentMessages(conversation.id, 20);
    const reply = await generateConversationReply({
      systemPrompt: settings.whatsapp_system_prompt.trim() || DEFAULT_WHATSAPP_SYSTEM_PROMPT,
      history,
      incomingBody: body,
    });

    let sentSid: string | null = null;
    if (channel === 'whatsapp') {
      sentSid = (await sendWhatsApp(from, reply)) || null;
    } else {
      await sendSMS(from, reply);
    }

    await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      body: reply,
      twilioSid: sentSid,
    });
  } catch (error) {
    console.error('[webhooks/unified] auto-reply AI eșuat:', error);
  }

  return twiml();
}
