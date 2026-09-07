import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { getSocket } from '../lib/socket'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

// Keeps one persistent, authenticated socket.io connection alive for the
// whole app (reusing the existing singleton from lib/socket.js) so friend
// online/offline presence and game invitations work from any page, not
// just from inside a game room.
export function SocketProvider({ children }) {
  const { token, user } = useAuth()
  const [onlineFriendIds, setOnlineFriendIds] = useState(() => new Set())
  const [incomingInvites, setIncomingInvites] = useState([])
  const [acceptedInvite, setAcceptedInvite] = useState(null)
  const [inviteNotice, setInviteNotice] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!token || !user) {
      // Logged out — drop the connection and reset presence state.
      const existing = socketRef.current
      if (existing && existing.connected) existing.disconnect()
      setOnlineFriendIds(new Set())
      setIncomingInvites([])
      setAcceptedInvite(null)
      setInviteNotice(null)
      return
    }

    const socket = getSocket()
    socketRef.current = socket
    socket.auth = { token }
    if (!socket.connected) socket.connect()

    const onOnlineFriends = ({ userIds }) => setOnlineFriendIds(new Set(userIds || []))
    const onFriendOnline = ({ userId }) => setOnlineFriendIds(prev => new Set(prev).add(userId))
    const onFriendOffline = ({ userId }) => setOnlineFriendIds(prev => {
      const next = new Set(prev)
      next.delete(userId)
      return next
    })
    const onGameInvite = (invite) => setIncomingInvites(prev => [...prev, invite])
    const onInviteAccepted = ({ inviteId, gameId }) => {
      setIncomingInvites(prev => prev.filter(i => i.inviteId !== inviteId))
      setAcceptedInvite({ gameId })
    }
    const onInviteDeclined = ({ inviteId }) => {
      setIncomingInvites(prev => prev.filter(i => i.inviteId !== inviteId))
      setInviteNotice({ type: 'declined' })
    }
    const onInviteFailed = ({ reason, toUserId }) => setInviteNotice({ type: 'failed', reason, toUserId })

    socket.on('online_friends', onOnlineFriends)
    socket.on('friend_online', onFriendOnline)
    socket.on('friend_offline', onFriendOffline)
    socket.on('game_invite', onGameInvite)
    socket.on('invite_accepted', onInviteAccepted)
    socket.on('invite_declined', onInviteDeclined)
    socket.on('invite_failed', onInviteFailed)

    return () => {
      socket.off('online_friends', onOnlineFriends)
      socket.off('friend_online', onFriendOnline)
      socket.off('friend_offline', onFriendOffline)
      socket.off('game_invite', onGameInvite)
      socket.off('invite_accepted', onInviteAccepted)
      socket.off('invite_declined', onInviteDeclined)
      socket.off('invite_failed', onInviteFailed)
    }
  }, [token, user])

  const inviteFriend = useCallback((friendId, timeControl) => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return
    socket.emit('invite_friend', { toUserId: friendId, timeControl })
  }, [])

  const respondToInvite = useCallback((inviteId, accept) => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return
    socket.emit('respond_invite', { inviteId, accept })
    setIncomingInvites(prev => prev.filter(i => i.inviteId !== inviteId))
  }, [])

  const dismissInviteNotice = useCallback(() => setInviteNotice(null), [])
  const clearAcceptedInvite = useCallback(() => setAcceptedInvite(null), [])

  const value = {
    onlineFriendIds,
    incomingInvites,
    acceptedInvite,
    inviteNotice,
    inviteFriend,
    respondToInvite,
    dismissInviteNotice,
    clearAcceptedInvite,
  }

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider')
  return ctx
}
