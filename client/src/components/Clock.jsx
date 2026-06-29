import React from 'react'

export default function Clock({ seconds, active, label, color }) {
  const mins = Math.floor(Math.max(0, seconds) / 60)
  const secs = Math.max(0, seconds) % 60
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`
  const isLow = seconds <= 30 && active

  return (
    <div style={{
      background: active ? (color === 'w' ? '#f1f5f9' : '#1e293b') : '#0f172a',
      color: isLow ? '#ef4444' : (active ? (color === 'w' ? '#0f172a' : '#f1f5f9') : '#64748b'),
      borderRadius: 8,
      padding: '10px 20px',
      minWidth: 120,
      textAlign: 'center',
      border: active ? '2px solid #3b82f6' : '2px solid transparent',
      transition: 'all 0.3s',
    }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 28,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 1,
        animation: active ? 'pulse-clock 1s infinite' : 'none',
      }}>
        {formatted}
      </div>
    </div>
  )
}
