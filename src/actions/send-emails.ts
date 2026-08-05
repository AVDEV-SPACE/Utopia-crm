'use server';

import nodemailer from 'nodemailer';

interface BookingEmailParams {
  name: string;
  email: string;
  phone: string;
  service: string;
  date: string;
  time: string;
}

export async function sendBookingEmails(params: BookingEmailParams): Promise<{ success: boolean; error?: string }> {
  const { name, email, service, date, time } = params;

  const user = process.env.EMAIL_FROM_ADDRESS || 'avdev.space@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!pass) {
    console.warn('GMAIL_APP_PASSWORD not set — skipping confirmation email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    });

    const formattedDate = new Date(date).toLocaleDateString('ro-RO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    await transporter.sendMail({
      from: `Utopia Systems <${user}>`,
      to: email,
      subject: `Confirmare consultație — ${service}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
          <h2 style="color: #f59e0b;">Consultație confirmată</h2>
          <p>Bună, <strong>${name}</strong>!</p>
          <p>Consultația ta a fost înregistrată cu succes.</p>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px 0; color: #666;">Serviciu</td><td style="padding: 8px 0; font-weight: 600;">${service}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Data</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Ora</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr>
          </table>
          <p style="color: #666; font-size: 14px;">Echipa Utopia Systems te va contacta pentru detalii suplimentare.</p>
          <p style="color: #666; font-size: 14px;">— Utopia Systems</p>
        </div>
      `,
    });

    return { success: true };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: String(err) };
  }
}

interface Recipient {
  name: string;
  email: string;
}

export async function sendEducationalEmails(
  templateContent: string,
  recipients: Recipient[]
): Promise<{ success: boolean; message: string }> {
  const user = process.env.EMAIL_FROM_ADDRESS || 'avdev.space@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!pass) {
    return { success: false, message: 'Email not configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    });

    const results = await Promise.allSettled(
      recipients.map(r =>
        transporter.sendMail({
          from: `Utopia Systems <${user}>`,
          to: r.email,
          subject: 'Mesaj de la Utopia Systems',
          html: templateContent.replace(/\{\{name\}\}/g, r.name || 'Client'),
        })
      )
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    const sent = results.length - failed;
    return { success: sent > 0, message: `${sent} trimise, ${failed} eșuate` };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
