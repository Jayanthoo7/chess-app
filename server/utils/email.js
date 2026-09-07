const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Fail fast instead of hanging the request for nodemailer's 2-minute
    // default — some hosts (e.g. free PaaS tiers) block outbound SMTP
    // entirely, which otherwise looks like a stuck request rather than a
    // clear, quick failure that falls back to console logging.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });

  return transporter;
}

async function sendOtpEmail(to, code, purpose) {
  const t = getTransporter();
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

  if (!t) {
    // No SMTP configured (e.g. local dev without a Gmail app password yet) —
    // log the OTP to the server console instead of failing outright.
    console.warn(`[email] SMTP not configured — OTP for ${to} (${purpose}): ${code}`);
    return { delivered: false };
  }

  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    // Never let an SMTP failure (bad creds, blocked port, timeout, etc.) crash
    // the process or fail the request — log it and fall back to the console,
    // same as the "not configured" path above. The caller still succeeds.
    console.error(`[email] Failed to send OTP to ${to} (${purpose}): ${err.message}`);
    console.warn(`[email] OTP for ${to} (${purpose}): ${code}`);
    return { delivered: false, error: err.message };
  }
}

module.exports = { sendOtpEmail };
