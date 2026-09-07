import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { api } from '../lib/api'

const TIME_CONTROLS = [
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
]

export default function Friends() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { onlineFriendIds, inviteFriend } = useSocket()

  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [formMsg, setFormMsg] = useState(null)
  const [timeControl, setTimeControl] = useState(600)
  const [invited, setInvited] = useState({})

  const loadAll = useCallback(async () => {
    try {
      const [friendsData, requestsData] = await Promise.all([
        api.getFriends(token),
        api.getFriendRequests(token),
      ])
      setFriends(friendsData.friends || [])
      setIncoming(requestsData.incoming || [])
      setOutgoing(requestsData.outgoing || [])
    } catch (e) {
      setFormMsg({ type: 'error', text: 'Could not load friends.' })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadAll() }, [loadAll])

  const sendRequest = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setFormMsg(null)
    try {
      await api.sendFriendRequest({ email: email.trim() }, token)
      setFormMsg({ type: 'success', text: 'Friend request sent.' })
      setEmail('')
      loadAll()
    } catch (err) {
      setFormMsg({ type: 'error', text: err.message || 'Could not send request.' })
    } finally {
      setSending(false)
    }
  }

  const accept = async (id) => {
    try {
      await api.acceptFriendRequest(id, token)
      loadAll()
    } catch (err) {
      setFormMsg({ type: 'error', text: err.message || 'Could not accept request.' })
    }
  }

  const decline = async (id) => {
    try {
      await api.declineFriendRequest(id, token)
      loadAll()
    } catch (err) {
      setFormMsg({ type: 'error', text: err.message || 'Could not decline request.' })
    }
  }

  const invite = (friendId) => {
    inviteFriend(friendId, timeControl)
    setInvited(prev => ({ ...prev, [friendId]: true }))
    setTimeout(() => setInvited(prev => ({ ...prev, [friendId]: false })), 4000)
  }

  const btnBase = {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 500, border: 'none', transition: 'all 0.15s',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>👥 Friends</h1>
          <button onClick={() => navigate('/')} style={{
            ...btnBase, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
          }}>← Home</button>
        </div>

        <form onSubmit={sendRequest} style={{ background: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 8 }}>ADD A FRIEND BY EMAIL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="friend@example.com"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8,
                background: '#1e293b', border: '1px solid #334155',
                color: '#f1f5f9', fontSize: 14, outline: 'none',
              }}
            />
            <button type="submit" disabled={sending} style={{
              ...btnBase, background: '#3b82f6', color: '#fff', fontSize: 14, padding: '10px 20px',
              opacity: sending ? 0.6 : 1,
            }}>{sending ? 'Sending...' : 'Send'}</button>
          </div>
          {formMsg && (
            <div style={{ marginTop: 10, fontSize: 13, color: formMsg.type === 'error' ? '#f87171' : '#34d399' }}>
              {formMsg.text}
            </div>
          )}
        </form>

        {loading ? (
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>Loading...</div>
        ) : (
          <>
            {incoming.length > 0 && (
              <div style={{ background: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>INCOMING REQUESTS</div>
                {incoming.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid #1e293b',
                  }}>
                    <div>
                      <div style={{ color: '#f1f5f9', fontSize: 14 }}>{r.from.name}</div>
                      <div style={{ color: '#475569', fontSize: 12 }}>{r.from.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => accept(r.id)} style={{ ...btnBase, background: '#059669', color: '#fff' }}>Accept</button>
                      <button onClick={() => decline(r.id)} style={{ ...btnBase, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {outgoing.length > 0 && (
              <div style={{ background: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>SENT REQUESTS</div>
                {outgoing.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0',
                  }}>
                    <div>
                      <div style={{ color: '#f1f5f9', fontSize: 14 }}>{r.to.name}</div>
                      <div style={{ color: '#475569', fontSize: 12 }}>{r.to.email}</div>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Pending...</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: '#0f172a', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  YOUR FRIENDS {friends.length > 0 && `(${friends.length})`}
                </div>
                {friends.length > 0 && (
                  <select
                    value={timeControl}
                    onChange={e => setTimeControl(Number(e.target.value))}
                    style={{
                      background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
                      borderRadius: 6, fontSize: 12, padding: '4px 6px',
                    }}
                  >
                    {TIME_CONTROLS.map(tc => (
                      <option key={tc.seconds} value={tc.seconds}>{tc.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {friends.length === 0 ? (
                <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>
                  No friends yet — add one by email above.
                </div>
              ) : friends.map(f => {
                const online = onlineFriendIds.has(f.id)
                return (
                  <div key={f.friendshipId} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid #1e293b',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: online ? '#34d399' : '#475569', flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ color: '#f1f5f9', fontSize: 14 }}>{f.name}</div>
                        <div style={{ color: '#475569', fontSize: 12 }}>{online ? 'Online' : 'Offline'}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => invite(f.id)}
                      disabled={!online}
                      style={{
                        ...btnBase,
                        background: online ? '#3b82f6' : '#1e293b',
                        border: online ? 'none' : '1px solid #334155',
                        color: online ? '#fff' : '#475569',
                        cursor: online ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {invited[f.id] ? 'Invited!' : 'Invite to Play'}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
