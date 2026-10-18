// src/app/api/send-booking-emails/route.ts
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_FROM_ADDRESS || 'avdev.space@gmail.com',
    // Fără fallback în cod: un secret scris aici ajunge în git și în bundle-ul serverului
    pass: process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS,
  },
  pool: true,
  maxConnections: 3,
});

const CLINIC_ADDRESS = 'Strada Gării nr.9, Baia Mare';
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'avdev.space@gmail.com';
const CLINIC_EMAIL = FROM_EMAIL;

// Simple email sending function using Nodemailer Gmail SMTP
async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  // Verificare conexiune SMTP - exact same as working app
  try {
    await transporter.verify();
    console.log('✅ Conexiune SMTP verificată');
  } catch (verifyError: unknown) {
    const errorMessage = verifyError instanceof Error ? verifyError.message : 'Unknown error';
    console.error('❌ Eroare verificare SMTP:', errorMessage);
    throw new Error(`Eroare conexiune SMTP: ${errorMessage}`);
  }

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: to,
    replyTo: replyTo,
    subject: subject,
    html: html,
  });

  console.log(`✅ Email trimis către ${to}`);
}

interface BookingData {
  name: string; email: string; phone: string; service: string; date: string; time: string;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr.split(' ')[0]);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

// ─── Paleta brand Dentaal ──────────────────────────────────────────────
// --c-dark: #462513  --c-mid: #2d1810  --c-warm: #faf7f3
// --c-cream: #f5efe8  --text: #d4663c  --project-text: #d87236
// ──────────────────────────────────────────────────────────────────────

function getPatientConfirmationHTML(name: string, date: string, time: string, service: string): string {
  const formattedDate = formatDate(date);
  const cleanTime = time.replace(/:00$/, '');

  return `
<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Confirmare Programare · Dentaal</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#dad3d3;font-family:'DM Sans',system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#dad3d3;padding:44px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(160deg,#2d1810 0%,#462513 100%);border-radius:16px 16px 0 0;padding:52px 52px 44px;text-align:center;">
    <div style="margin-bottom:22px;">
      <span style="display:inline-block;width:36px;height:1px;background:rgba(212,102,60,0.4);vertical-align:middle;"></span>
      <span style="display:inline-block;width:5px;height:5px;background:#d4663c;border-radius:50%;margin:0 10px;vertical-align:middle;"></span>
      <span style="display:inline-block;width:36px;height:1px;background:rgba(212,102,60,0.4);vertical-align:middle;"></span>
    </div>
    <p style="margin:0 0 6px;font-size:10px;letter-spacing:5px;text-transform:uppercase;color:rgba(250,247,243,0.4);">Clinică Stomatologică</p>
    <h1 style="margin:0 0 4px;font-family:'Playfair Display',serif;font-size:42px;font-weight:400;font-style:italic;color:#faf7f3;letter-spacing:0.5px;line-height:1;">Dentaal</h1>
    <p style="margin:0 0 32px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#d4663c;">Baia Mare</p>
    <h2 style="margin:0;font-family:'Playfair Display',serif;font-size:28px;font-weight:400;color:#faf7f3;line-height:1.3;">Programarea dvs. a fost<br><em style="color:#d87236;">confirmată</em></h2>
    <div style="margin-top:28px;"><span style="display:inline-block;width:52px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,102,60,0.5),transparent);"></span></div>
  </td></tr>

  <!-- STATUS BAR -->
  <tr><td style="background:#d4663c;padding:11px 52px;text-align:center;">
    <p style="margin:0;font-size:12px;font-weight:600;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">✓ &nbsp;Confirmare Automată · Sistem Booking Online</p>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#faf7f3;padding:44px 52px 40px;">
    <h3 style="margin:0 0 10px;font-family:'Playfair Display',serif;font-size:26px;font-weight:400;font-style:italic;color:#2d1810;">Bună ziua, ${name}.</h3>
    <p style="margin:0 0 36px;font-size:15px;color:#6b5040;line-height:1.8;">
      Programarea dumneavoastră la <strong style="color:#462513;">Clinica Dentaal</strong> a fost înregistrată cu succes. Mai jos găsiți toate detaliile vizitei.
    </p>

    <!-- Details card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:12px;border:1px solid #e8ddd5;overflow:hidden;margin-bottom:24px;">
      <tr><td style="background:#f5efe8;padding:14px 28px;border-bottom:1px solid #e8ddd5;">
        <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d4663c;">Detalii Programare</p>
      </td></tr>
      <tr><td style="padding:24px 28px 8px;">

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
          <tr>
            <td width="34" style="vertical-align:top;padding-top:3px;"><div style="width:30px;height:30px;background:#f5efe8;border-radius:8px;text-align:center;line-height:30px;font-size:15px;">🦷</div></td>
            <td style="padding-left:14px;">
              <p style="margin:0 0 2px;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;">Serviciu</p>
              <p style="margin:0;font-family:'Playfair Display',serif;font-size:19px;font-weight:600;color:#2d1810;">${service}</p>
            </td>
          </tr>
        </table>
        <div style="height:1px;background:#f0e8e0;margin-bottom:18px;"></div>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
          <tr>
            <td width="50%" style="vertical-align:top;padding-right:16px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="34" style="vertical-align:top;padding-top:3px;"><div style="width:30px;height:30px;background:#f5efe8;border-radius:8px;text-align:center;line-height:30px;font-size:15px;">📅</div></td>
                  <td style="padding-left:14px;">
                    <p style="margin:0 0 2px;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;">Data</p>
                    <p style="margin:0;font-size:15px;font-weight:500;color:#2d1810;">${formattedDate}</p>
                  </td>
                </tr>
              </table>
            </td>
            <td width="50%" style="vertical-align:top;padding-left:16px;border-left:1px solid #f0e8e0;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="34" style="vertical-align:top;padding-top:3px;"><div style="width:30px;height:30px;background:#f5efe8;border-radius:8px;text-align:center;line-height:30px;font-size:15px;">🕐</div></td>
                  <td style="padding-left:14px;">
                    <p style="margin:0 0 2px;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;">Ora</p>
                    <p style="margin:0;font-size:26px;font-weight:700;color:#d4663c;">${cleanTime}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <div style="height:1px;background:#f0e8e0;margin-bottom:18px;"></div>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
          <tr>
            <td width="34" style="vertical-align:top;padding-top:3px;"><div style="width:30px;height:30px;background:#f5efe8;border-radius:8px;text-align:center;line-height:30px;font-size:15px;">📍</div></td>
            <td style="padding-left:14px;">
              <p style="margin:0 0 2px;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;">Locație</p>
              <p style="margin:0;font-size:15px;font-weight:500;color:#2d1810;">${CLINIC_ADDRESS}</p>
            </td>
          </tr>
        </table>

      </td></tr>
    </table>

    <!-- Info note -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f4;border-radius:10px;border:1px solid #f0d8cc;border-left:3px solid #d4663c;margin-bottom:36px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#d4663c;">Informații importante</p>
        <p style="margin:0 0 7px;font-size:14px;color:#6b5040;line-height:1.7;"><span style="color:#d87236;">→</span>&nbsp; Vă rugăm să ajungeți cu <strong style="color:#462513;">10 minute înainte</strong> de ora programată.</p>
        <p style="margin:0 0 7px;font-size:14px;color:#6b5040;line-height:1.7;"><span style="color:#d87236;">→</span>&nbsp; Reprogramări: <strong style="color:#462513;">0745 068 273</strong></p>
        <p style="margin:0;font-size:14px;color:#6b5040;line-height:1.7;"><span style="color:#d87236;">→</span>&nbsp; Parcare disponibilă în fața clinicii.</p>
      </td></tr>
    </table>

    <!-- Sign off -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e8ddd5;">
      <tr><td style="padding-top:24px;">
        <p style="margin:0 0 4px;font-size:14px;color:#9a7a6a;">Cu respect,</p>
        <p style="margin:0 0 2px;font-family:'Playfair Display',serif;font-size:20px;font-style:italic;color:#2d1810;">Dr. Andrei Vasilescu</p>
        <p style="margin:0;font-size:13px;color:#b09080;">Clinica Dentaal · Baia Mare</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f5efe8;border-radius:0 0 16px 16px;border-top:1px solid #e8ddd5;padding:22px 52px;text-align:center;">
    <div style="margin-bottom:10px;">
      <span style="display:inline-block;width:20px;height:1px;background:#ddd0c5;vertical-align:middle;"></span>
      <span style="display:inline-block;width:4px;height:4px;background:#d4663c;border-radius:50%;margin:0 8px;vertical-align:middle;opacity:0.5;"></span>
      <span style="display:inline-block;width:20px;height:1px;background:#ddd0c5;vertical-align:middle;"></span>
    </div>
    <p style="margin:0 0 3px;font-size:12px;color:#b09080;">Clinica Dentaal · ${CLINIC_ADDRESS}</p>
    <p style="margin:0;font-size:11px;color:#c8b8ac;">© ${new Date().getFullYear()} Dentaal · Mesaj automat, vă rugăm să nu răspundeți.</p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

function getClinicNotificationHTML(name: string, phone: string, email: string, date: string, time: string, service: string): string {
  const formattedDate = formatDate(date);
  const cleanTime = time.replace(/:00$/, '');

  return `
<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Programare Nouă · Dentaal Admin</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#dad3d3;font-family:'DM Sans',system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#dad3d3;padding:44px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(160deg,#2d1810 0%,#462513 100%);border-radius:16px 16px 0 0;padding:30px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td>
        <p style="margin:0 0 2px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(250,247,243,0.35);">Dentaal · Admin</p>
        <p style="margin:0;font-family:'Playfair Display',serif;font-size:22px;font-style:italic;color:#faf7f3;">Programare nouă înregistrată</p>
      </td>
      <td align="right" style="vertical-align:middle;">
        <div style="background:#d4663c;border-radius:7px;padding:8px 16px;display:inline-block;">
          <p style="margin:0;font-size:10px;font-weight:600;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">ONLINE BOOKING</p>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#faf7f3;padding:40px 48px;">

    <!-- Alert -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f4;border-radius:10px;border-left:3px solid #d4663c;margin-bottom:32px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:14px;color:#7a3a1a;font-weight:500;">
          📋 &nbsp;O nouă programare online a fost înregistrată și necesită confirmare în CRM.
        </p>
      </td></tr>
    </table>

    <!-- Client -->
    <p style="margin:0 0 14px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d4663c;">Date Pacient</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:10px;border:1px solid #e8ddd5;margin-bottom:24px;">
      <tr><td style="padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td width="110" style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;vertical-align:middle;">Nume</td>
            <td style="font-size:17px;font-weight:600;color:#2d1810;">${name}</td>
          </tr>
        </table>
        <div style="height:1px;background:#f0e8e0;margin-bottom:14px;"></div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td width="110" style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;vertical-align:middle;">Telefon</td>
            <td><span style="display:inline-block;background:#fff0e8;color:#d4663c;font-size:17px;font-weight:700;padding:4px 14px;border-radius:6px;">${phone}</span></td>
          </tr>
        </table>
        <div style="height:1px;background:#f0e8e0;margin-bottom:14px;"></div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="110" style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;vertical-align:middle;">Email</td>
            <td style="font-size:14px;color:#6b5040;">${email}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Appointment -->
    <p style="margin:0 0 14px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d4663c;">Detalii Programare</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:10px;border:1px solid #e8ddd5;margin-bottom:24px;">
      <tr><td style="padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td width="110" style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;vertical-align:top;padding-top:3px;">Serviciu</td>
            <td style="font-size:17px;font-weight:600;color:#2d1810;">${service}</td>
          </tr>
        </table>
        <div style="height:1px;background:#f0e8e0;margin-bottom:14px;"></div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td width="110" style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;vertical-align:middle;">Data</td>
            <td style="font-size:15px;font-weight:500;color:#2d1810;">${formattedDate}</td>
          </tr>
        </table>
        <div style="height:1px;background:#f0e8e0;margin-bottom:14px;"></div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="110" style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#b09080;vertical-align:middle;">Ora</td>
            <td><span style="display:inline-block;background:#fff0e8;color:#d4663c;font-size:24px;font-weight:700;padding:4px 18px;border-radius:8px;">${cleanTime}</span></td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Actions -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f0;border-radius:10px;border:1px solid #f0d8c8;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d4663c;">Acțiuni recomandate</p>
        <p style="margin:0 0 7px;font-size:14px;color:#7a4a2a;"><span style="color:#d87236;">→</span> &nbsp;Verifică disponibilitatea în CRM și confirmă programarea</p>
        <p style="margin:0 0 7px;font-size:14px;color:#7a4a2a;"><span style="color:#d87236;">→</span> &nbsp;Contactează pacientul dacă este necesară o confirmare suplimentară</p>
        <p style="margin:0;font-size:14px;color:#7a4a2a;"><span style="color:#d87236;">→</span> &nbsp;Pregătește dosarul medical înainte de vizită</p>
      </td></tr>
    </table>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f5efe8;border-radius:0 0 16px 16px;border-top:1px solid #e8ddd5;padding:22px 48px;text-align:center;">
    <p style="margin:0 0 3px;font-size:12px;color:#b09080;">Clinica Dentaal · ${CLINIC_ADDRESS}</p>
    <p style="margin:0;font-size:11px;color:#c8b8ac;">Notificare automată · ${new Date().toISOString()}</p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {

    let booking: BookingData;
    try { booking = await request.json(); }
    catch { return NextResponse.json({ success: false, message: 'Date invalide trimise' }, { status: 400 }); }

    if (!booking.email || !booking.name) {
      return NextResponse.json({ success: false, message: 'Datele de booking sunt incomplete' }, { status: 400 });
    }

    const sendResults = await Promise.allSettled([
      sendEmail(
        booking.email,
        `Programare confirmată · ${formatDate(booking.date)} · ora ${booking.time.replace(/:00$/, '')}`,
        getPatientConfirmationHTML(booking.name, booking.date, booking.time, booking.service),
        CLINIC_EMAIL
      ),
      sendEmail(
        CLINIC_EMAIL,
        `Programare nouă: ${booking.name} · ${formatDate(booking.date)} · ${booking.time.replace(/:00$/, '')}`,
        getClinicNotificationHTML(booking.name, booking.phone, booking.email, booking.date, booking.time, booking.service)
      ),
    ]);

    const errors: string[] = [];
    let successCount = 0;
    sendResults.forEach((r, i) => {
      if (r.status === 'fulfilled') successCount++;
      else errors.push(`${i === 0 ? 'Pacient' : 'Clinică'}: ${(r as PromiseRejectedResult).reason?.message}`);
    });

    return NextResponse.json({
      success: successCount > 0,
      message: successCount === 2 ? 'Ambele emailuri trimise!' : successCount === 1 ? `Un email trimis: ${errors.join('; ')}` : `Eroare: ${errors.join('; ')}`,
      details: { patientEmailSent: sendResults[0].status === 'fulfilled', clinicNotificationSent: sendResults[1].status === 'fulfilled' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: `Eroare: ${msg}` }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
  });
}

export async function GET() {
  return NextResponse.json({ status: 'API functional', nodemailer_configured: !!process.env.EMAIL_FROM_ADDRESS, timestamp: new Date().toISOString() });
}