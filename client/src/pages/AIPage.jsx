import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
import ChessBoard from '../components/ChessBoard'
import Clock from '../components/Clock'
import MoveHistory from '../components/MoveHistory'

const DIFFICULTY = [
  { label: 'Beginner', skill: 1, depth: 4 },
  { label: 'Easy',     skill: 4, depth: 6 },
  { label: 'Medium',   skill: 8, depth: 10 },
  { label: 'Hard',     skill: 15, depth: 14 },
  { label: 'Expert',   skill: 20, depth: 18 },
]

export default function AIPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const playerName = params.get('name') || 'Player'
  const timeControl = parseInt(params.get('tc') || '600', 10)
  const [playerColor] = useState('w') // player is always white vs AI

  const [chess] = useState(() => new Chess())
  const [fen, setFen] = useState(chess.fen())
  const [moves, setMoves] = useState([])
  const [lastMove, setLastMove] = useState(null)
  const [inCheck, setInCheck] = useState(false)
  const [gameOver, setGameOver] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [difficulty, setDifficulty] = useState(DIFFICULTY[2])
  const [clocks, setClocks] = useState({ w: timeControl, b: timeControl })
  const [gameStarted, setGameStarted] = useState(false)
  const [message, setMessage] = useState('')
  const [aiError, setAiError] = useState(false)

  const stockfishRef = useRef(null)
  const clockRef = useRef(null)
  const turnRef = useRef('w')
  const clocksRef = useRef({ w: timeControl, b: timeControl })

  // Init Stockfish
  useEffect(() => {
    try {
      const sf = new Worker('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js')
      sf.postMessage('uci')
      stockfishRef.current = sf
    } catch (e) {
      setAiError(true)
    }
    return () => {
      stockfishRef.current?.terminate()
      clearInterval(clockRef.current)
    }
  }, [])

  // Clock tick
  useEffect(() => {
    if (!gameStarted || gameOver) return
    clockRef.current = setInterval(() => {
      const turn = turnRef.current
      clocksRef.current[turn] = Math.max(0, clocksRef.current[turn] - 1)
      setClocks({ ...clocksRef.current })
      if (clocksRef.current[turn] <= 0) {
        clearInterval(clockRef.current)
        const winner = turn === 'w' ? 'b' : 'w'
        setGameOver(winner === 'w' ? `${playerName} wins on time!` : 'Stockfish wins on time!')
      }
    }, 1000)
    return () => clearInterval(clockRef.current)
  }, [gameStarted, gameOver])

  const syncState = useCallback(() => {
    setFen(chess.fen())
    setMoves(chess.history())
    setInCheck(chess.inCheck())
    turnRef.current = chess.turn()
  }, [chess])

  const checkGameOver = useCallback(() => {
    if (chess.isCheckmate()) {
      clearInterval(clockRef.current)
      const loser = chess.turn()
      setGameOver(loser === 'b' ? `${playerName} wins by checkmate! ♔` : 'Stockfish wins by checkmate! ♚')
      return true
    }
    if (chess.isDraw()) {
      clearInterval(clockRef.current)
      if (chess.isStalemate()) setGameOver('Stalemate — Draw')
      else if (chess.isThreefoldRepetition()) setGameOver('Draw by repetition')
      else if (chess.isInsufficientMaterial()) setGameOver('Draw — insufficient material')
      else setGameOver('Draw')
      return true
    }
    return false
  }, [chess, playerName])

  const getAIMove = useCallback((currentFen) => {
    if (!stockfishRef.current || gameOver) return
    setThinking(true)
    const sf = stockfishRef.current

    const handler = (e) => {
      const line = e.data
      if (typeof line === 'string' && line.startsWith('bestmove')) {
        sf.removeEventListener('message', handler)
        setThinking(false)
        const parts = line.split(' ')
        const best = parts[1]
        if (!best || best === '(none)') return

        const from = best.slice(0, 2)
        const to = best.slice(2, 4)
        const promo = best[4] || undefined

        try {
          chess.move({ from, to, promotion: promo || 'q' })
          const mv = chess.history({ verbose: true }).slice(-1)[0]
          if (mv) setLastMove({ from: mv.from, to: mv.to })
          syncState()
          checkGameOver()
        } catch (err) {}
      }
    }

    sf.addEventListener('message', handler)
    sf.postMessage(`setoption name Skill Level value ${difficulty.skill}`)
    sf.postMessage(`position fen ${currentFen}`)
    sf.postMessage(`go depth ${difficulty.depth}`)
  }, [chess, difficulty, gameOver, syncState, checkGameOver])

  const handlePlayerMove = useCallback((move) => {
    if (chess.turn() !== playerColor || gameOver) return
    try {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' })
      const mv = chess.history({ verbose: true }).slice(-1)[0]
      if (mv) setLastMove({ from: mv.from, to: mv.to })
      syncState()
      setGameStarted(true)
      if (!checkGameOver()) {
        setTimeout(() => getAIMove(chess.fen()), 300)
      }
    } catch (e) {}
  }, [chess, playerColor, gameOver, syncState, checkGameOver, getAIMove])

  const newGame = () => {
    chess.reset()
    clearInterval(clockRef.current)
    clocksRef.current = { w: timeControl, b: timeControl }
    setFen(chess.fen())
    setMoves([])
    setLastMove(null)
    setInCheck(false)
    setGameOver(null)
    setGameStarted(false)
    setClocks({ w: timeControl, b: timeControl })
    setMessage('')
    turnRef.current = 'w'
  }

  const turn = chess.turn()

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 8px' }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>← Home</button>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>vs Stockfish · {difficulty.label}</div>
        <button onClick={newGame} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>New Game</button>
      </div>

      {aiError && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 16px', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
          Stockfish failed to load. Moves will be random.
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
            <div style={{ fontSize: 14, color: '#e2e8f0' }}>♚ Stockfish{thinking ? ' (thinking...)' : ''}</div>
            <Clock seconds={clocks.b} active={gameStarted && !gameOver && turn === 'b'} label="" color="b" />
          </div>

          <ChessBoard
            fen={fen}
            playerColor={playerColor}
            onMove={handlePlayerMove}
            lastMove={lastMove}
            inCheck={inCheck}
            disabled={!!gameOver || turn !== playerColor || thinking}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
            <div style={{ fontSize: 14, color: '#e2e8f0' }}>♔ {playerName}</div>
            <Clock seconds={clocks.w} active={gameStarted && !gameOver && turn === 'w'} label="" color="w" />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
          {gameOver && (
            <div style={{ background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 8, padding: '12px 14px', textAlign: 'center', color: '#93c5fd', fontSize: 14 }}>
              {gameOver}
            </div>
          )}

          {!gameStarted && !gameOver && (
            <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              You play White. Make your move!
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Difficulty</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {DIFFICULTY.map(d => (
                <button key={d.label} onClick={() => { setDifficulty(d); newGame() }} style={{
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  background: difficulty.label === d.label ? '#1d4ed8' : '#1e293b',
                  color: difficulty.label === d.label ? '#fff' : '#94a3b8',
                  border: difficulty.label === d.label ? '1px solid #3b82f6' : '1px solid #334155',
                }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Move History</div>
            <MoveHistory moves={moves} />
          </div>

          {gameOver && (
            <button onClick={newGame} style={{ padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              Play Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
