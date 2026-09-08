import { useCallback, useEffect, useRef, useState } from 'react'
import type { Board } from '../engine/board'
import type { Config } from './presets'

const STORAGE_KEY = 'hushfield.best'

export type BestTimes = Record<string, number>

export function configKey(c: Config): string {
  return `${c.width}x${c.height}x${c.mines}`
}

export function loadBestTimes(storage: Pick<Storage, 'getItem'> | null): BestTimes {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    const out: BestTimes = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && v > 0) out[k] = v
    return out
  } catch {
    return {}
  }
}

/** Returns the updated table, or the same object when `ms` is not an improvement. */
export function recordBest(times: BestTimes, key: string, ms: number): BestTimes {
  const prev = times[key]
  if (prev !== undefined && prev <= ms) return times
  return { ...times, [key]: ms }
}

export function formatTime(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

/** Tracks personal bests; reports whether the most recent win set a new one. */
export function useBestTimes(board: Board, config: Config, elapsedMs: number) {
  const [times, setTimes] = useState<BestTimes>(() =>
    loadBestTimes(typeof localStorage === 'undefined' ? null : localStorage),
  )
  const [isNewBest, setIsNewBest] = useState(false)
  const recorded = useRef<Board | null>(null)

  useEffect(() => {
    if (board.status !== 'won') {
      if (isNewBest && board.status === 'idle') setIsNewBest(false)
      return
    }
    if (recorded.current === board) return
    recorded.current = board
    const next = recordBest(times, configKey(config), elapsedMs)
    setIsNewBest(next !== times)
    if (next !== times) {
      setTimes(next)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* private mode or quota: keep the in-memory table */
      }
    }
  }, [board, config, elapsedMs, times, isNewBest])

  const bestFor = useCallback((c: Config): number | undefined => times[configKey(c)], [times])
  return { bestFor, isNewBest }
}
