/**
 * GA4 Data API — vizualizări lunare pentru utopia-systems.ro
 *
 * Setup necesar (o singură dată):
 * 1. Google Cloud Console → IAM → Service Accounts → creează cont → descarcă JSON key
 * 2. GA4 Admin → Property Access Management → adaugă email-ul service account cu rol "Viewer"
 * 3. Copiază Property ID numeric din GA4 Admin (ex: 123456789)
 * 4. Adaugă în .env:
 *      GA4_PROPERTY_ID=123456789
 *      GOOGLE_SERVICE_ACCOUNT_EMAIL=my-sa@project.iam.gserviceaccount.com
 *      GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 */

import { NextResponse } from 'next/server';

const GA4_PROPERTY_ID       = process.env.GA4_PROPERTY_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY           = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

/** Obține un access token OAuth2 prin JWT grant (fără dependențe extra) */
async function getAccessToken(): Promise<string> {
  const now  = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  // Encode header + payload
  const encoder = new TextEncoder();
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${header}.${payload}`;

  // Import private key
  const pemBody = PRIVATE_KEY!
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export async function GET() {
  // Dacă credentials nu sunt configurate, returnează placeholder
  if (!GA4_PROPERTY_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    return NextResponse.json({
      pageviews: null,
      configured: false,
      message: 'GA4_PROPERTY_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL și GOOGLE_PRIVATE_KEY nu sunt setate în .env',
    });
  }

  try {
    const accessToken = await getAccessToken();

    // GA4 Data API — sesiuni lunare
    const body = {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      metrics:    [{ name: 'sessions' }, { name: 'screenPageViews' }],
    };

    const gaRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
      {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!gaRes.ok) {
      const err = await gaRes.text();
      console.error('GA4 API error:', err);
      return NextResponse.json({ pageviews: null, configured: true, error: 'GA4 API error' });
    }

    const data = await gaRes.json();
    const row  = data.rows?.[0]?.metricValues;

    return NextResponse.json({
      configured: true,
      sessions:   row ? Number(row[0].value) : 0,
      pageviews:  row ? Number(row[1].value) : 0,
    });

  } catch (error) {
    console.error('GA4 fetch error:', error);
    return NextResponse.json({ pageviews: null, configured: true, error: 'Unexpected error' });
  }
}
