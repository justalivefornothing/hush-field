import { maxMines } from '../engine/board'

export interface Config {
  width: number
  height: number
  mines: number
}

export type PresetKey = 'beginner' | 'intermediate' | 'expert' | 'custom'

export const PRESETS: Record<Exclude<PresetKey, 'custom'>, Config> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
}

export const LIMITS = { minSize: 5, maxWidth: 40, maxHeight: 30 }

export function presetFor(config: Config): PresetKey {
  for (const [key, c] of Object.entries(PRESETS) as Array<[PresetKey, Config]>) {
    if (c.width === config.width && c.height === config.height && c.mines === config.mines) return key
  }
  return 'custom'
}

/** Clamp any user-entered config into a playable one. */
export function sanitize(config: Config): Config {
  const width = clamp(Math.round(config.width) || 0, LIMITS.minSize, LIMITS.maxWidth)
  const height = clamp(Math.round(config.height) || 0, LIMITS.minSize, LIMITS.maxHeight)
  const mines = clamp(Math.round(config.mines) || 0, 1, maxMines(width, height))
  return { width, height, mines }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** `#beginner/daily-2026-09-08` or `#12x10x15/kq7mvx2r`. */
export function encodeHash(config: Config, seed: string): string {
  const key = presetFor(config)
  const size = key === 'custom' ? `${config.width}x${config.height}x${config.mines}` : key
  return `#${size}/${encodeURIComponent(seed)}`
}

export function decodeHash(hash: string): { config: Config; seed: string } | null {
  const body = hash.replace(/^#/, '')
  if (!body) return null
  const slash = body.indexOf('/')
  const size = slash === -1 ? body : body.slice(0, slash)
  const seed = slash === -1 ? '' : decodeURIComponent(body.slice(slash + 1))
  let config: Config | undefined
  if (size in PRESETS) {
    config = PRESETS[size as keyof typeof PRESETS]
  } else {
    const m = /^(\d+)x(\d+)x(\d+)$/.exec(size)
    if (m) config = sanitize({ width: Number(m[1]), height: Number(m[2]), mines: Number(m[3]) })
  }
  if (!config || !seed) return null
  return { config, seed }
}
