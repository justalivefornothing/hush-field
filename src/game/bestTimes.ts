import { useCallback, useEffect, useState } from 'react'
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
  const [lastWin, setLastWin] = useState<{ board: Board; newBest: boolean } | null>(null)

  // A won board is an immutable snapshot, so "have we scored this one" is a
  // plain identity check and can be derived during render.
  if (board.status === 'won' && lastWin?.board !== board) {
    const next = recordBest(times, configKey(config), elapsedMs)
    if (next !== times) setTimes(next)
    setLastWin({ board, newBest: next !== times })
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(times))
    } catch {
      /* private mode or quota: keep the in-memory table */
    }
  }, [times])

  const bestFor = useCallback((c: Config): number | undefined => times[configKey(c)], [times])
  const isNewBest = board.status === 'won' && lastWin?.board === board && lastWin.newBest
  return { bestFor, isNewBest }
}
