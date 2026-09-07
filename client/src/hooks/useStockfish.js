import { useRef, useCallback, useEffect } from 'react'

const STOCKFISH_CDN = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js'
const ENGINE_TIMEOUT_MS = 15000

// Loading the engine used to fail silently: browsers refuse to construct a
// Worker directly from a cross-origin script URL (new Worker(cdnUrl)). The
// fix is to fetch the script ourselves and run it from a same-origin Blob
// URL instead — that's allowed, since the Worker's origin becomes the page's
// own blob: origin rather than the CDN's.
export function useStockfish() {
  const workerRef = useRef(null)
  const readyRef = useRef(null)
  const pendingRef = useRef(null)
  const blobUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const initWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current

    const res = await fetch(STOCKFISH_CDN)
    if (!res.ok) throw new Error('Failed to download chess engine')
    const code = await res.text()
    const blob = new Blob([code], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    blobUrlRef.current = blobUrl

    const worker = new Worker(blobUrl)

    readyRef.current = new Promise((resolve, reject) => {
      const onHandshake = (e) => {
        const line = e.data
        if (typeof line !== 'string') return
        if (line === 'uciok') {
          worker.postMessage('isready')
        } else if (line === 'readyok') {
          worker.removeEventListener('message', onHandshake)
          resolve()
        }
      }
      worker.addEventListener('message', onHandshake)
      worker.addEventListener('error', () => reject(new Error('Engine worker failed to start')))
      worker.postMessage('uci')
    })

    worker.addEventListener('message', (e) => {
      const line = e.data
      if (typeof line === 'string' && line.startsWith('bestmove') && pendingRef.current) {
        const parts = line.split(' ')
        const move = parts[1]
        const { resolve } = pendingRef.current
        pendingRef.current = null
        resolve(move && move !== '(none)' ? move : null)
      }
    })

    workerRef.current = worker
    return worker
  }, [])

  // Resolves with a UCI move string like "e2e4", or null if the engine
  // couldn't produce one in time (caller should fall back to a random move).
  const getBestMove = useCallback((fen, depth = 12, skillLevel = 10) => {
    return new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        resolve(result)
      }
      const timeoutId = setTimeout(() => {
        pendingRef.current = null
        finish(null)
      }, ENGINE_TIMEOUT_MS)

      initWorker()
        .then(async (worker) => {
          await readyRef.current
          pendingRef.current = { resolve: finish }
          worker.postMessage(`setoption name Skill Level value ${skillLevel}`)
          worker.postMessage(`position fen ${fen}`)
          worker.postMessage(`go depth ${depth}`)
        })
        .catch(() => finish(null))
    })
  }, [initWorker])

  return { getBestMove }
}
