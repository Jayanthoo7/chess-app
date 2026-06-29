import React, { useState, useCallback } from 'react'
import { Chess } from 'chess.js'

const PIECES = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
}
const FILES = 'abcdefgh'

export default function ChessBoard({
  fen,
  playerColor = 'w',       // which side this client plays ('w','b','both')
  onMove,                  // callback(move: {from,to,promotion?}) => void
  lastMove = null,         // {from,to}
  inCheck = false,
  disabled = false,
  flipped = false,
}) {
  const [selected, setSelected] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [promotionPending, setPromotionPending] = useState(null)

  const chess = new Chess(fen)

  const rows = flipped
    ? [7, 6, 5, 4, 3, 2, 1, 0] 
    : [0, 1, 2, 3, 4, 5, 6, 7] 

  const cols = flipped
    ? [7, 6, 5, 4, 3, 2, 1, 0]
    : [0, 1, 2, 3, 4, 5, 6, 7]

  const findKing = (color) => {
    const board = chess.board()
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (board[r][c]?.type === 'k' && board[r][c]?.color === color)
          return `${FILES[c]}${8 - r}`
    return null
  }

  const kingSquare = inCheck ? findKing(chess.turn()) : null

  const handleCellClick = useCallback((sq) => {
    if (disabled) return
    const turn = chess.turn()
    if (playerColor !== 'both' && turn !== playerColor) return

    if (selected) {
      const mv = legalMoves.find(m => m.to === sq)
      if (mv) {
        // Check promotion
        const piece = chess.get(selected)
        const toRank = sq[1]
        if (piece?.type === 'p' && ((piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1'))) {
          setPromotionPending({ from: selected, to: sq, color: piece.color })
          return
        }
        onMove?.({ from: selected, to: sq })
        setSelected(null)
        setLegalMoves([])
        return
      }
      // Click same = deselect; click own piece = reselect
      const piece = chess.get(sq)
      if (piece && piece.color === turn) {
        setSelected(sq)
        const moves = chess.moves({ square: sq, verbose: true })
        setLegalMoves(moves)
        return
      }
      setSelected(null)
      setLegalMoves([])
      return
    }

    const piece = chess.get(sq)
    if (!piece) return
    if (playerColor !== 'both' && piece.color !== playerColor) return
    if (piece.color !== turn) return
    setSelected(sq)
    const moves = chess.moves({ square: sq, verbose: true })
    setLegalMoves(moves)
  }, [selected, legalMoves, fen, disabled, playerColor, onMove])

  const handlePromotion = (promo) => {
    const { from, to } = promotionPending
    setPromotionPending(null)
    setSelected(null)
    setLegalMoves([])
    onMove?.({ from, to, promotion: promo })
  }

  const legalSquares = new Set(legalMoves.map(m => m.to))
  const captureSquares = new Set(legalMoves.filter(m => m.captured || m.flags.includes('e')).map(m => m.to))

  const cellSize = 'min(12vw, 80px)'

  return (
    <div className="relative inline-block select-none">
      {/* Board */}
      <div className="relative">
        {rows.map((rowIdx) => (
          <div key={rowIdx} className="flex">
            {/* Rank label */}
            <div style={{ width: 18, fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {8 - rowIdx}
            </div>
            {cols.map((colIdx) => {
              const sq = `${FILES[colIdx]}${8 - rowIdx}`
              const piece = chess.get(sq)
              const isLight = (rowIdx + colIdx) % 2 === 0
              const isSel = selected === sq
              const isLegal = legalSquares.has(sq)
              const isCapture = captureSquares.has(sq)
              const isLastFrom = lastMove?.from === sq
              const isLastTo = lastMove?.to === sq
              const isKingCheck = kingSquare === sq

              let bg = isLight ? '#f0d9b5' : '#b58863'
              if (isSel) bg = '#f6f669'
              else if (isKingCheck) bg = '#ff4444'
              else if (isLastFrom) bg = '#cdd16f'
              else if (isLastTo) bg = '#aaa23a'

              const pieceKey = piece ? (piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase() : null

              return (
                <div
                  key={sq}
                  onClick={() => handleCellClick(sq)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: bg,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'filter 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.filter = ''}
                >
                  {isLegal && !isCapture && (
                    <div className="legal-dot" />
                  )}
                  {isLegal && isCapture && (
                    <div className="legal-ring" />
                  )}
                  {pieceKey && (
                    <span 
                      className="piece-glyph"
                      style={{ 
                        color: piece.color === 'w' ? '#ffffff' : '#000000',
                        textShadow: piece.color === 'w' ? '0px 1px 2px rgba(0,0,0,0.5)' : 'none'
                      }}
                    >
                      {PIECES[pieceKey]}
                    </span>
                  )}
                  {/* File label bottom row */}
                  {rowIdx === 7 && (
                    <span style={{ position: 'absolute', bottom: 1, right: 3, fontSize: 10, color: isLight ? '#b58863' : '#f0d9b5', lineHeight: 1 }}>
                      {FILES[colIdx]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Promotion modal */}
      {promotionPending && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 16, display: 'flex', gap: 8 }}>
            {['Q','R','B','N'].map(p => {
              const pk = promotionPending.color === 'w' ? 'w'+p : 'b'+p
              return (
                <div key={p} className="promo-piece" onClick={() => handlePromotion(p.toLowerCase())}>
                  {PIECES[pk]}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}