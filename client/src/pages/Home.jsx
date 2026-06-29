import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const TIME_CONTROLS = [
  { label: '1 min', seconds: 60, tag: 'Bullet' },
  { label: '3 min', seconds: 180, tag: 'Blitz' },
  { label: '5 min', seconds: 300, tag: 'Blitz' },
  { label: '10 min', seconds: 600, tag: 'Rapid' },
  { label: '15 min', seconds: 900, tag: 'Rapid' },
  { label: '30 min', seconds: 1800, tag: 'Classical' },
]

export default function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState(() => localStorage.getItem('chess_name') || '')
  const [timeControl, setTimeControl] = useState(600)
  const [roomId, setRoomId] = useState('')
  const [creating, setCreating] = useState(false)
  const [recentGames, setRecentGames] = useState([])
  const [tab, setTab] = useState('play') // 'play' | 'ai' | 'history'

  useEffect(() => {
    fetch(`${SERVER}/api/games`)
      .then(r => r.json())
      .then(setRecentGames)
      .catch(() => {})
  }, [])

  const saveName = (n) => {
    setName(n)
    localStorage.setItem('chess_name', n)
  }

  const createGame = async () => {
    if (!name.trim()) return alert('Enter your name first')
    setCreating(true)
    try {
      const res = await fetch(`${SERVER}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControl }),
      })
      const data = await res.json()
      navigate(`/game/${data.id}?name=${encodeURIComponent(name)}&tc=${timeControl}`)
    } catch (e) {
      alert('Could not connect to server. Make sure server is running on port 3001.')
    } finally {
      setCreating(false)
    }
  }

  const joinGame = () => {
    if (!name.trim()) return alert('Enter your name first')
    if (!roomId.trim()) return alert('Enter a room ID')
    navigate(`/game/${roomId.trim()}?name=${encodeURIComponent(name)}`)
  }

  const playAI = () => {
    if (!name.trim()) return alert('Enter your name first')
    navigate(`/ai?name=${encodeURIComponent(name)}&tc=${timeControl}`)
  }

  const btnBase = {
    padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, fontWeight: 500, border: 'none', transition: 'all 0.15s',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>♟</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f1f5f9', margin: '8px 0 4px' }}>Chess</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>Play online · vs AI · save history</p>
      </div>

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>YOUR NAME</label>
          <input
            value={name}
            onChange={e => saveName(e.target.value)}
            placeholder="Enter name..."
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              background: '#1e293b', border: '1px solid #334155',
              color: '#f1f5f9', fontSize: 15, outline: 'none',
            }}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#1e293b', borderRadius: 8, padding: 4 }}>
          {[['play','⚔️ Online'],['ai','🤖 vs AI'],['history','📋 History']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...btnBase, flex: 1, padding: '8px 0',
              background: tab === t ? '#3b82f6' : 'transparent',
              color: tab === t ? '#fff' : '#64748b',
            }}>{l}</button>
          ))}
        </div>

        {/* Time Control */}
        {(tab === 'play' || tab === 'ai') && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 8 }}>TIME CONTROL</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {TIME_CONTROLS.map(tc => (
                <button key={tc.seconds} onClick={() => setTimeControl(tc.seconds)} style={{
                  ...btnBase, padding: '8px 4px', textAlign: 'center',
                  background: timeControl === tc.seconds ? '#1d4ed8' : '#1e293b',
                  color: timeControl === tc.seconds ? '#fff' : '#94a3b8',
                  border: timeControl === tc.seconds ? '1px solid #3b82f6' : '1px solid #334155',
                  fontSize: 13,
                }}>
                  <div style={{ fontWeight: 600 }}>{tc.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>{tc.tag}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'play' && (
          <>
            <button onClick={createGame} disabled={creating} style={{
              ...btnBase, width: '100%', marginBottom: 12,
              background: '#3b82f6', color: '#fff', fontSize: 15,
              opacity: creating ? 0.6 : 1,
            }}>
              {creating ? 'Creating...' : '+ Create Game'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                placeholder="Room ID..."
                onKeyDown={e => e.key === 'Enter' && joinGame()}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8,
                  background: '#1e293b', border: '1px solid #334155',
                  color: '#f1f5f9', fontSize: 14, outline: 'none',
                }}
              />
              <button onClick={joinGame} style={{
                ...btnBase, background: '#059669', color: '#fff',
              }}>Join</button>
            </div>
          </>
        )}

        {tab === 'ai' && (
          <button onClick={playAI} style={{
            ...btnBase, width: '100%', background: '#7c3aed', color: '#fff', fontSize: 15,
          }}>
            🤖 Play vs Stockfish
          </button>
        )}

        {tab === 'history' && (
          <div>
            {recentGames.length === 0 ? (
              <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No games yet</div>
            ) : recentGames.map(g => (
              <div key={g.id} onClick={() => navigate(`/game/${g.id}?spectate=1`)}
                style={{
                  background: '#1e293b', borderRadius: 8, padding: '10px 14px',
                  marginBottom: 8, cursor: 'pointer', border: '1px solid #334155',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: '#f1f5f9', fontSize: 13 }}>{g.white_player} vs {g.black_player}</span>
                  <span style={{ color: '#64748b', fontSize: 11 }}>{g.status}</span>
                </div>
                <div style={{ color: '#475569', fontSize: 11 }}>{g.id.slice(0, 8)}... · {Math.floor(g.time_control / 60)} min</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
