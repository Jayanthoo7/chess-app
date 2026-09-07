// Sends OTP emails via Brevo's HTTP API (https://api.brevo.com) instead of
// raw SMTP. Gmail (and most mail providers) throttle or flat-out time out
// SMTP connections coming from cloud/hosting IP ranges like Render's, which
// is why plain nodemailer+Gmail worked locally but failed in production.
// Brevo's API runs over plain HTTPS, so it isn't affected by that at all,
// and its free tier (300 emails/day) needs only a single verified sender
// email — not a whole custom domain.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendOtpEmail(to, code, purpose) {
  const apiKey = process.env.BREVO_API_KEY;
  const subject = purpose === 'login'
    ? 'Your Chess App login code'
    : 'Verify your Chess App email';
  const text = `Your one-time verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#1a1a2e;">Chess App</h2>
      <p>Your one-time verification code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color:#1d4ed8;">${code}</p>
      <p style="color:#64748b; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!apiKey) {
    // No Brevo API key configured (e.g. local dev) — log the OTP to the
    // server console instead of failing outright.
    console.warn(`[email] BREVO_API_KEY not configured — OTP for ${to} (${purpose}): ${code}`);
    return { delivered: false };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_FROM, name: 'Chess App' },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API responded ${res.status}: ${body.slice(0, 300)}`);
    }
    return { delivered: true };
  } catch (err) {
    // Never let a Brevo/network failure crash the process or fail the
    // request — log it and fall back to the console, same as the
    // unconfigured-key path above. The caller still succeeds.
    console.error(`[email] Failed to send OTP to ${to} (${purpose}): ${err.message}`);
    console.warn(`[email] OTP for ${to} (${purpose}): ${code}`);
    return { delivered: false, error: err.message };
  }
}

module.exports = { sendOtpEmail };
