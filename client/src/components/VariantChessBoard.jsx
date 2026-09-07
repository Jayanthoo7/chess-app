import React, { useState, useCallback } from 'react'

// Renders a taller-than-standard board (10x8 / 12x8) driven entirely by
// server-provided state: a 2D `board` array and a `legalMovesByFrom` map of
// every legal destination for the side to move. Unlike ChessBoard (which
// uses chess.js locally for move generation), this component has no rules
// engine of its own — it only ever shows moves the server already computed,
// and the server is what actually validates any move sent back to it.
const PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}
const FILES = 'abcdefgh'

export default function VariantChessBoard({
  board,
  legalMovesByFrom = {},
  rows,
  turn = 'w',
  playerColor = 'w',       // which side this client plays ('w','b','both')
  onMove,                  // callback({from:{row,col}, to:{row,col}, promotion?}) => void
  lastMove = null,         // {from:{row,col}, to:{row,col}}
  inCheck = false,
  disabled = false,
  flipped = false,
}) {
  const [selected, setSelected] = useState(null)
  const [promotionPending, setPromotionPending] = useState(null)

  // Row 0 is White's back rank internally; unflipped, White sits at the
  // bottom of the screen (rows-1 down to 0), matching ChessBoard's standard
  // orientation. Columns are unaffected by board height.
  const screenRows = flipped
    ? Array.from({ length: rows }, (_, i) => i)
    : Array.from({ length: rows }, (_, i) => rows - 1 - i)
  const screenCols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const bottomRow = screenRows[screenRows.length - 1]

  const findKing = (color) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]?.type === 'k' && board[r][c]?.color === color) return { row: r, col: c }
      }
    }
    return null
  }
  const kingSquare = inCheck ? findKing(turn) : null

  const selectedMoves = selected ? (legalMovesByFrom[`${selected.row},${selected.col}`] || []) : []
  const legalSet = new Set(selectedMoves.map(m => `${m.row},${m.col}`))

  const handleCellClick = useCallback((row, col) => {
    if (disabled) return
    if (playerColor !== 'both' && turn !== playerColor) return

    if (selected) {
      const mv = selectedMoves.find(m => m.row === row && m.col === col)
      if (mv) {
        const piece = board[selected.row][selected.col]
        if (mv.promotion) {
          setPromotionPending({ from: selected, to: { row, col }, color: piece.color })
          return
        }
        onMove?.({ from: selected, to: { row, col } })
        setSelected(null)
        return
      }
      // Click same square = deselect; click another own piece = reselect.
      const piece = board[row][col]
      if (piece && piece.color === turn) {
        setSelected({ row, col })
        return
      }
      setSelected(null)
      return
    }

    const piece = board[row][col]
    if (!piece) return
    if (playerColor !== 'both' && piece.color !== playerColor) return
    if (piece.color !== turn) return
    setSelected({ row, col })
  }, [selected, selectedMoves, board, disabled, playerColor, turn, onMove])

  const handlePromotion = (promo) => {
    const { from, to } = promotionPending
    setPromotionPending(null)
    setSelected(null)
    onMove?.({ from, to, promotion: promo })
  }

  const cellSize = 'min(12vw, 80px)'

  return (
    <div className="relative inline-block select-none">
      <div className="relative">
        {screenRows.map((row) => (
          <div key={row} className="flex">
            <div style={{ width: 18, fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {row + 1}
            </div>
            {screenCols.map((col) => {
              const piece = board[row][col]
              const isLight = (row + col) % 2 === 0
              const isSel = selected?.row === row && selected?.col === col
              const isLegal = legalSet.has(`${row},${col}`)
              const isCapture = isLegal && !!piece
              const isLastFrom = lastMove?.from?.row === row && lastMove?.from?.col === col
              const isLastTo = lastMove?.to?.row === row && lastMove?.to?.col === col
              const isKingCheck = kingSquare?.row === row && kingSquare?.col === col

              let bg = isLight ? '#f0d9b5' : '#b58863'
              if (isSel) bg = '#f6f669'
              else if (isKingCheck) bg = '#ff4444'
              else if (isLastFrom) bg = '#cdd16f'
              else if (isLastTo) bg = '#aaa23a'

              const pieceKey = piece ? (piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase() : null

              return (
                <div
                  key={col}
                  onClick={() => handleCellClick(row, col)}
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
                  {row === bottomRow && (
                    <span style={{ position: 'absolute', bottom: 1, right: 3, fontSize: 10, color: isLight ? '#b58863' : '#f0d9b5', lineHeight: 1 }}>
                      {FILES[col]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {promotionPending && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 16, display: 'flex', gap: 8 }}>
            {['Q', 'R', 'B', 'N'].map(p => {
              const pk = promotionPending.color === 'w' ? 'w' + p : 'b' + p
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
