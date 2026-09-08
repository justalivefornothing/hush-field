/**
 * Small deterministic PRNG utilities.
 *
 * A seed can be any string (shareable, human-readable) or a raw 32-bit
 * integer. Strings are folded to 32 bits with an FNV-1a style hash and then
 * fed to mulberry32, which is tiny, fast, and good enough for shuffling a
 * few hundred cells.
 */

export type Seed = string | number

/** FNV-1a over UTF-16 code units, then a final avalanche so short seeds differ well. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export function seedToInt(seed: Seed): number {
  return typeof seed === 'number' ? seed >>> 0 : hashString(seed)
}

/** mulberry32: returns a function producing floats in [0, 1). */
export function mulberry32(seed: Seed): () => number {
  let a = seedToInt(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The shared seed for today's board, e.g. "daily-2026-09-08" (local date). */
export function dailySeed(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `daily-${y}-${m}-${d}`
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** A short, typeable random seed like "kq7mvx2r". */
export function randomSeed(length = 8): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}
