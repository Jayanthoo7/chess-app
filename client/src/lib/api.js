const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${SERVER}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    const err = new Error('Could not reach the server. Make sure it is running.')
    err.status = 0
    throw err
  }

  let data = null
  try { data = await res.json() } catch {}

  if (!res.ok) {
    const err = new Error((data && data.error) || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  verifyEmail: (payload) => request('/api/auth/verify-email', { method: 'POST', body: payload }),
  resendOtp: (payload) => request('/api/auth/resend-otp', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  requestLoginOtp: (payload) => request('/api/auth/login-otp/request', { method: 'POST', body: payload }),
  verifyLoginOtp: (payload) => request('/api/auth/login-otp/verify', { method: 'POST', body: payload }),
  me: (token) => request('/api/auth/me', { token }),
}

export { SERVER }
