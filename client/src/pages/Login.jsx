import React, { useState, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
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
const btnBase = {
  padding: '8px 0', borderRadius: 8, cursor: 'pointer',
  fontSize: 14, fontWeight: 500, border: 'none', transition: 'all 0.15s', flex: 1,
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, requestLoginOtp, verifyLoginOtp } = useAuth()
  const captchaRef = useRef(null)
  const from = location.state?.from?.pathname || '/'

  const [mode, setMode] = useState('password') // 'password' | 'otp'
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpStep, setOtpStep] = useState('request') // 'request' | 'verify'
  const [code, setCode] = useState('')
  const [captchaToken, setCaptchaToken] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(null) // email awaiting verification

  const resetCaptcha = () => {
    captchaRef.current?.reset?.()
    setCaptchaToken(null)
  }

  const submitPasswordLogin = async (e) => {
    e.preventDefault()
    setError('')
    setNeedsVerification(null)
    if (!identifier.trim() || !password) return setError('Enter your email/phone and password.')
    setBusy(true)
    try {
      await login({ identifier: identifier.trim(), password, captchaToken })
      navigate(from, { replace: true })
    } catch (err) {
      if (err.data?.needsVerification) {
        setNeedsVerification(err.data.email)
      } else {
        setError(err.message)
      }
      resetCaptcha()
    } finally {
      setBusy(false)
    }
  }

  const submitOtpRequest = async (e) => {
    e.preventDefault()
    setError('')
    if (!otpEmail.trim()) return setError('Enter your email.')
    setBusy(true)
    try {
      await requestLoginOtp({ email: otpEmail.trim(), captchaToken })
      setInfo('If that email is registered, a login code has been sent.')
      setOtpStep('verify')
    } catch (err) {
      setError(err.message)
      resetCaptcha()
    } finally {
      setBusy(false)
    }
  }

  const submitOtpVerify = async (e) => {
    e.preventDefault()
    setError('')
    if (code.trim().length !== 6) return setError('Enter the 6-digit code.')
    setBusy(true)
    try {
      await verifyLoginOtp({ email: otpEmail.trim(), code: code.trim() })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>♟</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: '8px 0 4px' }}>Chess</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Log in to play</p>
      </div>

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#1e293b', borderRadius: 8, padding: 4 }}>
          {[['password', 'Password'], ['otp', 'Email OTP']].map(([m, l]) => (
            <button key={m} onClick={() => { setMode(m); setError(''); setInfo(''); setNeedsVerification(null) }} style={{
              ...btnBase,
              background: mode === m ? '#3b82f6' : 'transparent',
              color: mode === m ? '#fff' : '#64748b',
            }}>{l}</button>
          ))}
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}
        {needsVerification && (
          <div style={{ background: '#78350f', color: '#fde68a', padding: '10px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            Your email isn't verified yet.{' '}
            <Link to={`/signup?verifyEmail=${encodeURIComponent(needsVerification)}`} style={{ color: '#fff', textDecoration: 'underline' }}>
              Verify it now
            </Link>
          </div>
        )}
        {info && !error && (
          <div style={{ background: '#052e2b', color: '#5eead4', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{info}</div>
        )}

        {mode === 'password' ? (
          <form onSubmit={submitPasswordLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>EMAIL OR PHONE NUMBER</label>
              <input style={inputStyle} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="you@example.com or phone number" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>PASSWORD</label>
              <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Captcha ref={captchaRef} onChange={setCaptchaToken} />
            </div>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Logging in...' : 'Log in'}
            </button>
          </form>
        ) : otpStep === 'request' ? (
          <form onSubmit={submitOtpRequest}>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>EMAIL</label>
              <input style={inputStyle} type="email" value={otpEmail} onChange={e => setOtpEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Captcha ref={captchaRef} onChange={setCaptchaToken} />
            </div>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Sending code...' : 'Send login code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtpVerify}>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
              Enter the 6-digit code sent to <strong style={{ color: '#e2e8f0' }}>{otpEmail}</strong>.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>LOGIN CODE</label>
              <input
                style={{ ...inputStyle, letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
              />
            </div>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginBottom: 12 }}>
              {busy ? 'Verifying...' : 'Verify & log in'}
            </button>
            <button type="button" onClick={() => setOtpStep('request')} style={{ width: '100%', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, padding: 6 }}>
              Use a different email
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
          Don't have an account? <Link to="/signup" style={{ color: '#3b82f6' }}>Sign up</Link>
        </div>
      </div>
    </div>
  )
}
