import React, { useEffect, useRef } from 'react'

export default function MoveHistory({ moves = [] }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [moves.length])

  const pairs = []
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: Math.floor(i / 2) + 1, w: moves[i], b: moves[i + 1] || '' })
  }

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 8,
      padding: '12px',
      height: 200,
      overflowY: 'auto',
      fontSize: 13,
    }}>
      {pairs.length === 0 ? (
        <div style={{ color: '#475569', textAlign: 'center', marginTop: 20 }}>No moves yet</div>
      ) : (
        pairs.map(({ n, w, b }) => (
          <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 2, alignItems: 'baseline' }}>
            <span style={{ color: '#475569', minWidth: 28, fontSize: 11 }}>{n}.</span>
            <span style={{ color: '#e2e8f0', minWidth: 60, fontFamily: 'monospace' }}>{w}</span>
            <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{b}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  )
}
