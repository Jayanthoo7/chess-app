import React, { useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Captcha from '../components/Captcha'

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  background: '#1e293b', border: '1px solid #334155',
  color: '#f1f5f9', fontSize: 15, outline: 'none',
}
const labelStyle = { fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }
const btnPrimary = {
  width: '100%', padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
  fontSize: 15, fontWeight: 500, border: 'none', background: '#3b82f6', color: '#fff',
}

export default function Signup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { register, verifyEmail, resendOtp } = useAuth()
  const captchaRef = useRef(null)

  const [step, setStep] = useState('form') // 'form' | 'otp'
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' })
  const [captchaToken, setCaptchaToken] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  // Coming from Login with an unverified account: jump straight to the OTP step.
  React.useEffect(() => {
    const prefillEmail = searchParams.get('verifyEmail')
    if (prefillEmail) {
      setForm(f => ({ ...f, email: prefillEmail }))
      setStep('otp')
      resendOtp({ email: prefillEmail, purpose: 'verify' })
        .then(() => setInfo('We sent a new 6-digit code to your email.'))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submitForm = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      return setError('Name, email, and password are required.')
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters.')
    }
    if (form.password !== form.confirm) {
      return setError('Passwords do not match.')
    }
    setBusy(true)
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        captchaToken,
      })
      setInfo('We sent a 6-digit code to your email.')
      setStep('otp')
    } catch (err) {
      setError(err.message)
      captchaRef.current?.reset?.()
      setCaptchaToken(null)
    } finally {
      setBusy(false)
    }
  }

  const submitOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (code.trim().length !== 6) return setError('Enter the 6-digit code.')
    setBusy(true)
    try {
      await verifyEmail({ email: form.email.trim(), code: code.trim() })
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError('')
    setInfo('')
    try {
      await resendOtp({ email: form.email.trim(), purpose: 'verify' })
      setInfo('A new code has been sent.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>♟</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: '8px 0 4px' }}>Create account</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Play online · vs AI · save history</p>
      </div>

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
        {error && (
          <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}
        {info && !error && (
          <div style={{ background: '#052e2b', color: '#5eead4', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{info}</div>
        )}

        {step === 'form' ? (
          <form onSubmit={submitForm}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>NAME</label>
              <input style={inputStyle} value={form.name} onChange={update('name')} placeholder="Your name" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>EMAIL</label>
              <input style={inputStyle} type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>PHONE NUMBER (OPTIONAL)</label>
              <input style={inputStyle} value={form.phone} onChange={update('phone')} placeholder="+91 90000 00000" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>PASSWORD</label>
              <input style={inputStyle} type="password" value={form.password} onChange={update('password')} placeholder="At least 8 characters" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>CONFIRM PASSWORD</label>
              <input style={inputStyle} type="password" value={form.confirm} onChange={update('confirm')} placeholder="Re-enter password" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Captcha ref={captchaRef} onChange={setCaptchaToken} />
            </div>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtp}>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
              Enter the 6-digit code we sent to <strong style={{ color: '#e2e8f0' }}>{form.email}</strong>.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>VERIFICATION CODE</label>
              <input
                style={{ ...inputStyle, letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
              />
            </div>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginBottom: 12 }}>
              {busy ? 'Verifying...' : 'Verify & continue'}
            </button>
            <button type="button" onClick={resend} style={{ width: '100%', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, padding: 6 }}>
              Resend code
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
          Already have an account? <Link to="/login" style={{ color: '#3b82f6' }}>Log in</Link>
        </div>
      </div>
    </div>
  )
}
