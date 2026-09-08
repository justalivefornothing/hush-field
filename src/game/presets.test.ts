import { describe, expect, it } from 'vitest'
import { formatTime, loadBestTimes, recordBest } from './bestTimes'
import { PRESETS, decodeHash, encodeHash, presetFor, sanitize } from './presets'

describe('presets', () => {
  it('recognises the three classic layouts', () => {
    expect(presetFor({ width: 9, height: 9, mines: 10 })).toBe('beginner')
    expect(presetFor({ width: 30, height: 16, mines: 99 })).toBe('expert')
    expect(presetFor({ width: 30, height: 16, mines: 98 })).toBe('custom')
  })

  it('sanitises custom sizes into the playable range', () => {
    expect(sanitize({ width: 2, height: 500, mines: 0 })).toEqual({ width: 5, height: 30, mines: 1 })
    // 5x5 leaves 16 eligible cells once the first-click zone is excluded.
    expect(sanitize({ width: 5, height: 5, mines: 99 })).toEqual({ width: 5, height: 5, mines: 16 })
    expect(sanitize({ width: Number.NaN, height: 7.6, mines: 3 })).toEqual({ width: 5, height: 8, mines: 3 })
  })
})

describe('share hash', () => {
  it('round-trips presets and custom boards', () => {
    expect(encodeHash(PRESETS.intermediate, 'daily-2026-09-08')).toBe('#intermediate/daily-2026-09-08')
    expect(decodeHash('#intermediate/daily-2026-09-08')).toEqual({
      config: PRESETS.intermediate,
      seed: 'daily-2026-09-08',
    })
    const custom = { width: 12, height: 10, mines: 15 }
    expect(decodeHash(encodeHash(custom, 'a b/c'))).toEqual({ config: custom, seed: 'a b/c' })
  })

  it('rejects malformed hashes', () => {
    expect(decodeHash('')).toBeNull()
    expect(decodeHash('#expert')).toBeNull()
    expect(decodeHash('#9x9/seed')).toBeNull()
    expect(decodeHash('#garbage/seed')).toBeNull()
  })
})

describe('best times', () => {
  it('only records improvements', () => {
    const a = recordBest({}, '9x9x10', 40_000)
    expect(a).toEqual({ '9x9x10': 40_000 })
    expect(recordBest(a, '9x9x10', 45_000)).toBe(a)
    expect(recordBest(a, '9x9x10', 30_000)).toEqual({ '9x9x10': 30_000 })
  })

  it('ignores corrupt storage', () => {
    expect(loadBestTimes({ getItem: () => '{oops' })).toEqual({})
    expect(loadBestTimes({ getItem: () => '{"9x9x10": 12000, "bad": "x"}' })).toEqual({ '9x9x10': 12000 })
    expect(loadBestTimes(null)).toEqual({})
  })

  it('formats seconds and minutes', () => {
    expect(formatTime(41_400)).toBe('41s')
    expect(formatTime(125_000)).toBe('2m 05s')
  })
})
