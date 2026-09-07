import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

// Mounted once near the app root so friend invites can be seen and acted on
// from any page, not just from inside a game room.
export default function InviteOverlay() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    incomingInvites, acceptedInvite, inviteNotice,
    respondToInvite, dismissInviteNotice, clearAcceptedInvite,
  } = useSocket()

  // The player who SENT the invite gets bounced into the game once the
  // other side accepts.
  useEffect(() => {
    if (acceptedInvite && user) {
      navigate(`/game/${acceptedInvite.gameId}?name=${encodeURIComponent(user.name)}&uid=${encodeURIComponent(user.id)}`)
      clearAcceptedInvite()
    }
  }, [acceptedInvite, user, navigate, clearAcceptedInvite])

  useEffect(() => {
    if (!inviteNotice) return
    const t = setTimeout(() => dismissInviteNotice(), 4000)
    return () => clearTimeout(t)
  }, [inviteNotice, dismissInviteNotice])

  const handleAccept = (invite) => {
    respondToInvite(invite.inviteId, true)
    if (user) {
      navigate(`/game/${invite.gameId}?name=${encodeURIComponent(user.name)}&uid=${encodeURIComponent(user.id)}`)
    }
  }

  const handleDecline = (invite) => {
    respondToInvite(invite.inviteId, false)
  }

  if (incomingInvites.length === 0 && !inviteNotice) return null

  const noticeText = (() => {
    if (!inviteNotice) return ''
    if (inviteNotice.type === 'declined') return 'Your game invite was declined.'
    if (inviteNotice.type === 'failed' && inviteNotice.reason === 'offline') return 'That friend just went offline.'
    if (inviteNotice.type === 'failed' && inviteNotice.reason === 'not_friends') return 'You can only invite friends to play.'
    return 'Something went wrong sending the invite.'
  })()

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320,
    }}>
      {incomingInvites.map(inv => (
        <div key={inv.inviteId} style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
          padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ color: '#f1f5f9', fontSize: 14, marginBottom: 4 }}>
            ♟ <strong>{inv.fromUser?.name || 'A friend'}</strong> invited you to play
          </div>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
            {Math.floor((inv.timeControl || 600) / 60)} min game
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleAccept(inv)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#059669', color: '#fff', fontSize: 13, fontWeight: 500,
            }}>Accept</button>
            <button onClick={() => handleDecline(inv)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
              background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 13,
            }}>Decline</button>
          </div>
        </div>
      ))}

      {inviteNotice && (
        <div style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
          padding: '12px 16px', color: '#f1f5f9', fontSize: 13,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {noticeText}
        </div>
      )}
    </div>
  )
}
