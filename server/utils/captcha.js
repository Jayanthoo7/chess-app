async function verifyCaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // If no secret is configured (e.g. still setting up locally), don't hard-fail —
  // but make it obvious in the logs so it never silently ships that way.
  if (!secret) {
    console.warn('[captcha] RECAPTCHA_SECRET_KEY not set — skipping captcha verification');
    return true;
  }

  if (!token) return false;

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    console.error('[captcha] verification request failed:', e.message);
    return false;
  }
}

module.exports = { verifyCaptcha };
