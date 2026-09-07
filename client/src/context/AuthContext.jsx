import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('chess_token'))
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('chess_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!token) { setLoading(false); return }
      try {
        const { user } = await api.me(token)
        if (!cancelled) {
          setUser(user)
          localStorage.setItem('chess_user', JSON.stringify(user))
        }
      } catch (e) {
        if (!cancelled) {
          setToken(null)
          setUser(null)
          localStorage.removeItem('chess_token')
          localStorage.removeItem('chess_user')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    check()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = (tok, usr) => {
    setToken(tok)
    setUser(usr)
    localStorage.setItem('chess_token', tok)
    localStorage.setItem('chess_user', JSON.stringify(usr))
  }

  const register = useCallback((payload) => api.register(payload), [])

  const verifyEmail = useCallback(async (payload) => {
    const data = await api.verifyEmail(payload)
    persist(data.token, data.user)
    return data
  }, [])

  const resendOtp = useCallback((payload) => api.resendOtp(payload), [])

  const login = useCallback(async (payload) => {
    const data = await api.login(payload)
    persist(data.token, data.user)
    return data
  }, [])

  const requestLoginOtp = useCallback((payload) => api.requestLoginOtp(payload), [])

  const verifyLoginOtp = useCallback(async (payload) => {
    const data = await api.verifyLoginOtp(payload)
    persist(data.token, data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('chess_token')
    localStorage.removeItem('chess_user')
  }, [])

  const value = {
    token, user, loading,
    register, verifyEmail, resendOtp,
    login, requestLoginOtp, verifyLoginOtp,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
