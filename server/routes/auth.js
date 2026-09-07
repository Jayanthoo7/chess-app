const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const { dbGet, dbRun } = require('../db');
const { verifyCaptcha } = require('../utils/captcha');
const { sendOtpEmail } = require('../utils/email');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

// Express 4 does not catch a rejected promise from an async handler — it
// becomes an unhandled rejection and (on modern Node) crashes the whole
// process. Wrap every async handler so a thrown/rejected error is forwarded
// to Express's error middleware (see index.js) as a normal 500 instead.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

// Stricter limiter for anything that sends an email or checks a password —
// on top of the CAPTCHA, this keeps brute-forcing/spamming impractical.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a while and try again.' },
});
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait a while and try again.' },
});

router.use(authLimiter);

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    emailVerified: !!user.email_verified,
  };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function createAndSendOtp(email, purpose) {
  const code = generateOtp();
  const now = Date.now();
  dbRun(
    `INSERT INTO otp_codes (email, code_hash, purpose, attempts, consumed, expires_at, created_at) VALUES (?,?,?,0,0,?,?)`,
    [email, hashOtp(code), purpose, now + OTP_TTL_MS, now]
  );
  await sendOtpEmail(email, code, purpose);
}

function verifyOtp(email, code, purpose) {
  const row = dbGet(
    `SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1`,
    [email, purpose]
  );
  if (!row) return { ok: false, error: 'No active code for this email. Please request a new one.' };
  if (row.attempts >= MAX_OTP_ATTEMPTS) return { ok: false, error: 'Too many incorrect attempts. Please request a new code.' };
  if (Date.now() > row.expires_at) return { ok: false, error: 'This code has expired. Please request a new one.' };

  if (hashOtp(code) !== row.code_hash) {
    dbRun(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
    return { ok: false, error: 'Incorrect code.' };
  }

  dbRun(`UPDATE otp_codes SET consumed = 1 WHERE id = ?`, [row.id]);
  return { ok: true };
}

// ---- Register ----
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, phone, captchaToken } = req.body || {};

  if (!name || !isValidEmail(email) || !password) {
    return res.status(400).json({ error: 'Name, a valid email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = dbGet(`SELECT id FROM users WHERE email = ?`, [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const now = Date.now();

  dbRun(
    `INSERT INTO users (id, name, email, phone, password_hash, email_verified, created_at) VALUES (?,?,?,?,?,0,?)`,
    [id, name.trim(), normalizedEmail, phone ? String(phone).trim() : null, passwordHash, now]
  );

  await createAndSendOtp(normalizedEmail, 'verify');

  res.status(201).json({ message: 'Account created. Check your email for a verification code.', email: normalizedEmail });
}));

// ---- Verify email (completes registration) ----
router.post('/verify-email', (req, res) => {
  const { email, code } = req.body || {};
  if (!isValidEmail(email) || !code) return res.status(400).json({ error: 'Email and code are required.' });

  const normalizedEmail = email.trim().toLowerCase();
  const result = verifyOtp(normalizedEmail, String(code).trim(), 'verify');
  if (!result.ok) return res.status(400).json({ error: result.error });

  dbRun(`UPDATE users SET email_verified = 1 WHERE email = ?`, [normalizedEmail]);
  const user = dbGet(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
  dbRun(`UPDATE users SET last_login_at = ? WHERE id = ?`, [Date.now(), user.id]);

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// ---- Resend OTP (verify or login purpose) ----
router.post('/resend-otp', otpLimiter, asyncHandler(async (req, res) => {
  const { email, purpose } = req.body || {};
  if (!isValidEmail(email) || !['verify', 'login'].includes(purpose)) {
    return res.status(400).json({ error: 'A valid email and purpose are required.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = dbGet(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

  // Don't reveal whether the account exists — always respond the same way.
  if (user && ((purpose === 'verify' && !user.email_verified) || (purpose === 'login' && user.email_verified))) {
    await createAndSendOtp(normalizedEmail, purpose);
  }
  res.json({ message: 'If that email is eligible, a new code has been sent.' });
}));

// ---- Login with password (email OR phone as identifier) ----
router.post('/login', asyncHandler(async (req, res) => {
  const { identifier, password, captchaToken } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'Identifier and password are required.' });

  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });

  const normalized = identifier.trim().toLowerCase();
  const user = dbGet(`SELECT * FROM users WHERE email = ? OR phone = ?`, [normalized, identifier.trim()]);
  if (!user) return res.status(401).json({ error: 'Invalid email/phone or password.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email/phone or password.' });

  if (!user.email_verified) {
    return res.status(403).json({ error: 'Please verify your email first.', needsVerification: true, email: user.email });
  }

  dbRun(`UPDATE users SET last_login_at = ? WHERE id = ?`, [Date.now(), user.id]);
  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
}));

// ---- Passwordless login: request an OTP ----
router.post('/login-otp/request', otpLimiter, asyncHandler(async (req, res) => {
  const { email, captchaToken } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });

  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });

  const normalizedEmail = email.trim().toLowerCase();
  const user = dbGet(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
  if (user && user.email_verified) {
    await createAndSendOtp(normalizedEmail, 'login');
  }
  res.json({ message: 'If that email is registered, a login code has been sent.' });
}));

// ---- Passwordless login: verify the OTP ----
router.post('/login-otp/verify', (req, res) => {
  const { email, code } = req.body || {};
  if (!isValidEmail(email) || !code) return res.status(400).json({ error: 'Email and code are required.' });

  const normalizedEmail = email.trim().toLowerCase();
  const result = verifyOtp(normalizedEmail, String(code).trim(), 'login');
  if (!result.ok) return res.status(400).json({ error: result.error });

  const user = dbGet(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
  if (!user) return res.status(401).json({ error: 'Account not found.' });

  dbRun(`UPDATE users SET last_login_at = ? WHERE id = ?`, [Date.now(), user.id]);
  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// ---- Current user ----
router.get('/me', requireAuth, (req, res) => {
  const user = dbGet(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: sanitizeUser(user) });
});

module.exports = router;
