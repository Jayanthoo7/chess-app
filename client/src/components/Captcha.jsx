import React, { forwardRef } from 'react'
import ReCAPTCHA from 'react-google-recaptcha'

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

// When no site key is configured yet (e.g. still setting up locally), we skip
// rendering the widget instead of crashing — the server does the matching
// skip on its side when RECAPTCHA_SECRET_KEY is unset, so auth still works.
const Captcha = forwardRef(function Captcha({ onChange }, ref) {
  if (!SITE_KEY) {
    return (
      <div style={{
        fontSize: 12, color: '#fbbf24', background: 'rgba(120,53,15,0.25)',
        border: '1px solid #78350f', borderRadius: 8, padding: '8px 10px',
      }}>
        CAPTCHA isn't configured yet (VITE_RECAPTCHA_SITE_KEY) — skipping it for now.
      </div>
    )
  }
  return (
    <ReCAPTCHA ref={ref} sitekey={SITE_KEY} theme="dark" onChange={onChange} />
  )
})

export default Captcha
