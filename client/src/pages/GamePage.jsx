import React, { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
import { connectSocket } from '../lib/socket'
import ChessBoard from '../components/ChessBoard'
import Clock from '../components/Clock'
import MoveHistory from '../components/MoveHistory'

export default function GamePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const playerName = params.get('name') || 'Player'
  const userId = params.get('uid') || null
  const isSpectator = params.get('spectate') === '1'

  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [playerColor, setPlayerColor] = useState(null)
  const [clocks, setClocks] = useState({ w: 600, b: 600 })
  const [players, setPlayers] = useState({ w: null, b: null })
  const [moves, setMoves] = useState([])
  const [lastMove, setLastMove] = useState(null)
  const [inCheck, setInCheck] = useState(false)
  const [gameStatus, setGameStatus] = useState('waiting') // waiting | playing | over
  const [gameOver, setGameOver] = useState(null)
  const [message, setMessage] = useState('')
  const [drawOffered, setDrawOffered] = useState(false)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = connectSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join_room', { roomId: id, playerName: isSpectator ? `👁 ${playerName}` : playerName, userId })
    })

    socket.on('joined', (data) => {
      setFen(data.fen)
      setPlayerColor(isSpectator ? 'spectator' : data.color)
      setClocks(data.clocks || { w: 600, b: 600 })
      setPlayers(data.players || {})
      if (data.color === 'spectator') setMessage('Watching as spectator')
      else setMessage(data.color === 'w' ? 'You play White. Waiting for opponent...' : 'You play Black. Waiting for opponent...')

      // Rebuild moves from pgn
      if (data.pgn) {
        const c = new Chess()
        try {
          c.loadPgn(data.pgn)
          setMoves(c.history())
        } catch {}
      }
    })

    socket.on('game_start', (data) => {
      setPlayers(data.players || {})
      setClocks(data.clocks || { w: 600, b: 600 })
      setGameStatus('playing')
      setMessage('')
    })

    socket.on('move_made', (data) => {
      setFen(data.fen)
      setInCheck(data.inCheck || false)
      setClocks(data.clocks || clocks)
      const c = new Chess()
      try {
        c.loadPgn(data.pgn)
        setMoves(c.history())
      } catch {}
      if (data.move) setLastMove({ from: data.move.from, to: data.move.to })
      if (data.status !== 'playing') {
        setGameStatus('over')
        endGame(data.status, data.winner)
      }
    })

    socket.on('clock_tick', (data) => {
      setClocks({ ...data.clocks })
    })

    socket.on('game_over', (data) => {
      setGameStatus('over')
      endGame(data.status, data.winner, data.reason)
    })

    socket.on('draw_offered', () => {
      setDrawOffered(true)
    })

    socket.on('player_disconnected', (data) => {
      setMessage(`${data.name} disconnected`)
    })

    socket.on('room_update', (data) => {
      setPlayers(data.players || {})
    })

    socket.on('invalid_move', () => {
      setMessage('Invalid move')
      setTimeout(() => setMessage(''), 2000)
    })

    socket.on('disconnect', () => setConnected(false))

    return () => {
      socket.off('connect')
      socket.off('joined')
      socket.off('game_start')
      socket.off('move_made')
      socket.off('clock_tick')
      socket.off('game_over')
      socket.off('draw_offered')
      socket.off('player_disconnected')
      socket.off('room_update')
      socket.off('invalid_move')
      socket.off('disconnect')
    }
  }, [id])

  const endGame = (status, winner, reason = '') => {
    let msg = ''
    if (status === 'checkmate') msg = winner === 'w' ? 'White wins by checkmate!' : 'Black wins by checkmate!'
    else if (status === 'draw' || status === 'stalemate') msg = 'Game drawn!'
    else if (status === 'resigned') msg = winner === 'w' ? 'White wins — Black resigned' : 'Black wins — White resigned'
    else if (status === 'timeout') msg = winner === 'w' ? 'White wins on time!' : 'Black wins on time!'
    else msg = 'Game over'
    if (reason === 'agreement') msg = 'Draw by agreement'
    setGameOver(msg)
  }

  const handleMove = (move) => {
    socketRef.current?.emit('move', { roomId: id, move })
  }

  const handleResign = () => {
    if (confirm('Resign this game?')) {
      socketRef.current?.emit('resign', { roomId: id })
    }
  }

  const handleOfferDraw = () => {
    socketRef.current?.emit('offer_draw', { roomId: id })
    setMessage('Draw offered')
  }

  const handleAcceptDraw = () => {
    setDrawOffered(false)
    socketRef.current?.emit('accept_draw', { roomId: id })
  }

  const chess = new Chess(fen)
  const turn = chess.turn()
  const isMyTurn = playerColor === turn

  const oppColor = playerColor === 'w' ? 'b' : 'w'
  const flipped = playerColor === 'b'

  const topPlayer = flipped ? players.w : players.b
  const bottomPlayer = flipped ? players.b : players.w
  const topColor = flipped ? 'w' : 'b'
  const bottomColor = flipped ? 'b' : 'w'

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 0 }}>
      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 8px' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>
          ← Home
        </button>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Room: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{id}</span>
          {' '}
          <button onClick={() => { navigator.clipboard.writeText(id); setMessage('Room ID copied!'); setTimeout(() => setMessage(''), 2000) }}
            style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 12 }}>
            Copy
          </button>
        </div>
        <div style={{ fontSize: 12, color: connected ? '#10b981' : '#ef4444' }}>
          {connected ? '● Connected' : '● Disconnected'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Board column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {/* Top player */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
            <div style={{ fontSize: 14, color: '#e2e8f0' }}>
              {topColor === 'w' ? '♔' : '♚'} {topPlayer?.name || 'Waiting...'}
            </div>
            <Clock seconds={clocks[topColor]} active={gameStatus === 'playing' && turn === topColor} label="" color={topColor} />
          </div>

          <ChessBoard
            fen={fen}
            playerColor={playerColor === 'spectator' ? 'both' : playerColor}
            onMove={handleMove}
            lastMove={lastMove}
            inCheck={inCheck}
            disabled={gameStatus !== 'playing' || !isMyTurn || playerColor === 'spectator'}
            flipped={flipped}
          />

          {/* Bottom player */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
            <div style={{ fontSize: 14, color: '#e2e8f0' }}>
              {bottomColor === 'w' ? '♔' : '♚'} {bottomPlayer?.name || 'You'}
            </div>
            <Clock seconds={clocks[bottomColor]} active={gameStatus === 'playing' && turn === bottomColor} label="" color={bottomColor} />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
          {/* Status */}
          {(message || gameOver) && (
            <div style={{
              background: gameOver ? '#1e3a5f' : '#0f172a',
              border: `1px solid ${gameOver ? '#3b82f6' : '#334155'}`,
              borderRadius: 8, padding: '10px 14px', textAlign: 'center',
              color: gameOver ? '#93c5fd' : '#94a3b8', fontSize: 14,
            }}>
              {gameOver || message}
            </div>
          )}

          {/* Move history */}
          <div>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Move History
            </div>
            <MoveHistory moves={moves} />
          </div>

          {/* Draw offer */}
          {drawOffered && (
            <div style={{ background: '#1e293b', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ color: '#f1f5f9', marginBottom: 8, fontSize: 14 }}>Draw offered</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAcceptDraw} style={{ flex: 1, padding: '8px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Accept</button>
                <button onClick={() => setDrawOffered(false)} style={{ flex: 1, padding: '8px', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Decline</button>
              </div>
            </div>
          )}

          {/* Actions */}
          {gameStatus === 'playing' && playerColor !== 'spectator' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleOfferDraw} style={{
                flex: 1, padding: '8px', background: '#1e293b', color: '#94a3b8',
                border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', fontSize: 13
              }}>½ Draw</button>
              <button onClick={handleResign} style={{
                flex: 1, padding: '8px', background: '#1e293b', color: '#ef4444',
                border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', fontSize: 13
              }}>Resign</button>
            </div>
          )}

          {gameStatus === 'over' && (
            <button onClick={() => navigate('/')} style={{
              padding: '10px', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500
            }}>Play Again</button>
          )}

          {/* Share */}
          {gameStatus === 'waiting' && (
            <div style={{ background: '#0f172a', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Share this room ID with a friend:</div>
              <div style={{ fontFamily: 'monospace', color: '#93c5fd', fontSize: 14, wordBreak: 'break-all' }}>{id}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
