/*
 * Copyright (c) 2026 Your Company Name
 * All rights reserved.
 */
import { useRef, useCallback, useEffect } from 'react'

const STOCKFISH_CDN = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js'

export function useStockfish() {
  const workerRef = useRef(null)
  const resolveRef = useRef(null)

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current

    // Convert CDN fetch to local Blob to avoid CORS errors
    const blob = new Blob([`importScripts('${STOCKFISH_CDN}');`], { 
        type: 'application/javascript' 
    })
    const workerUrl = URL.createObjectURL(blob)

    const worker = new Worker(workerUrl)
    
    worker.onmessage = (e) => {
      const line = e.data
      if (typeof line === 'string' && line.startsWith('bestmove') && resolveRef.current) {
        const parts = line.split(' ')
        const move = parts[1]
        if (move && move !== '(none)') {
          resolveRef.current(move)
          resolveRef.current = null
        }
      }
    }
    worker.postMessage('uci')
    workerRef.current = worker
    return worker
  }, [])

  const getBestMove = useCallback((fen, depth = 12, skillLevel = 10) => {
    return new Promise((resolve) => {
      try {
        const worker = initWorker()
        resolveRef.current = resolve
        worker.postMessage(`setoption name Skill Level value ${skillLevel}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${depth}`)
      } catch (e) {
        // Fallback: return null so caller can handle
        resolve(null)
      }
    })
  }, [initWorker])

  return { getBestMove }
}