/**
 * Hushfield engine.
 *
 * The board is a set of flat typed arrays indexed by `y * width + x`. Every
 * public function is pure: it clones the board (a few `.slice()` calls) and
 * returns a new one, so React can treat boards as immutable snapshots.
 *
 * Mines are not placed until the first reveal, which lets us exclude the
 * clicked cell and its eight neighbours and guarantee the opening click lands
 * on a zero and blooms open a region.
 */

import { mulberry32, type Seed } from './rng'

// Cell display states (values live in a Uint8Array, so no enum).
export const HIDDEN = 0
export const REVEALED = 1
export const FLAGGED = 2
export const QUESTION = 3
export type CellState = typeof HIDDEN | typeof REVEALED | typeof FLAGGED | typeof QUESTION

export type Status = 'idle' | 'playing' | 'won' | 'lost'

/** Cells excluded from mine placement around the first click: itself + 8 neighbours. */
export const SAFE_ZONE = 9

export interface Board {
  readonly width: number
  readonly height: number
  readonly mineCount: number
  /** 1 where a mine sits. Empty until `placed` is true. */
  readonly mines: Uint8Array
  /** Number of adjacent mines, 0..8. */
  readonly counts: Uint8Array
  /** CellState per cell. */
  readonly state: Uint8Array
  /** BFS distance from the click that revealed the cell (drives the ripple). */
  readonly distance: Uint8Array
  readonly revealedCount: number
  readonly flagCount: number
  readonly placed: boolean
  readonly status: Status
  /** Index of the mine that ended the game, or -1. */
  readonly exploded: number
}

export interface PlaceOptions {
  /** Cell that must stay clear along with its neighbours. */
  safeIndex: number
}

export function maxMines(width: number, height: number): number {
  return Math.max(1, width * height - SAFE_ZONE)
}

export function createBoard(width: number, height: number, mineCount: number): Board {
  const n = width * height
  return {
    width,
    height,
    mineCount: Math.min(mineCount, maxMines(width, height)),
    mines: new Uint8Array(n),
    counts: new Uint8Array(n),
    state: new Uint8Array(n),
    distance: new Uint8Array(n),
    revealedCount: 0,
    flagCount: 0,
    placed: false,
    status: 'idle',
    exploded: -1,
  }
}

export function indexOf(board: Pick<Board, 'width'>, x: number, y: number): number {
  return y * board.width + x
}

/** Indices of the up-to-8 cells around `i`, clipped to the grid. */
export function neighborsOf(width: number, height: number, i: number): number[] {
  const x = i % width
  const y = (i - x) / width
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy
    if (ny < 0 || ny >= height) continue
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      if (nx < 0 || nx >= width) continue
      out.push(ny * width + nx)
    }
  }
  return out
}

/**
 * Deferred mine placement. Builds the list of eligible cells (everything but
 * the safe cell and its neighbours), then runs a partial Fisher-Yates shuffle
 * driven by the seeded PRNG and takes the first `mineCount` entries.
 */
export function placeMines(
  width: number,
  height: number,
  mineCount: number,
  { safeIndex }: PlaceOptions,
  seed: Seed,
): Uint8Array {
  const n = width * height
  const excluded = new Uint8Array(n)
  if (safeIndex >= 0 && safeIndex < n) {
    excluded[safeIndex] = 1
    for (const k of neighborsOf(width, height, safeIndex)) excluded[k] = 1
  }

  const eligible: number[] = []
  for (let i = 0; i < n; i++) if (!excluded[i]) eligible.push(i)

  const take = Math.min(mineCount, eligible.length)
  const rand = mulberry32(seed)
  const mines = new Uint8Array(n)
  for (let k = 0; k < take; k++) {
    // Pick uniformly from the not-yet-taken tail and swap it into position k.
    const j = k + Math.floor(rand() * (eligible.length - k))
    const tmp = eligible[k]
    eligible[k] = eligible[j]
    eligible[j] = tmp
    mines[eligible[k]] = 1
  }
  return mines
}

/** Adjacent-mine count for every cell. */
export function countNeighbors(width: number, height: number, mines: Uint8Array): Uint8Array {
  const counts = new Uint8Array(width * height)
  for (let i = 0; i < mines.length; i++) {
    if (!mines[i]) continue
    for (const k of neighborsOf(width, height, i)) counts[k]++
  }
  return counts
}

/** Install a fixed mine layout (used by tests and by the first reveal). */
export function withMines(board: Board, mines: Uint8Array): Board {
  let mineCount = 0
  for (let i = 0; i < mines.length; i++) mineCount += mines[i]
  return {
    ...board,
    mines: mines.slice(),
    counts: countNeighbors(board.width, board.height, mines),
    mineCount,
    placed: true,
  }
}

interface Draft {
  state: Uint8Array
  distance: Uint8Array
  revealedCount: number
  hitMine: number
}

function draftOf(board: Board): Draft {
  return {
    state: board.state.slice(),
    distance: board.distance.slice(),
    revealedCount: board.revealedCount,
    hitMine: -1,
  }
}

/**
 * Iterative BFS flood fill. Reveals `start`, and whenever a revealed cell has
 * zero adjacent mines, enqueues all of its unrevealed, unflagged neighbours.
 * Each cell records its BFS depth from `start` (offset by `baseDistance`).
 */
function floodReveal(board: Board, d: Draft, start: number, baseDistance: number): void {
  if (d.state[start] === REVEALED || d.state[start] === FLAGGED) return
  if (board.mines[start]) {
    d.hitMine = start
    return
  }
  const queue: number[] = [start]
  d.state[start] = REVEALED
  d.distance[start] = Math.min(255, baseDistance)
  d.revealedCount++

  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    if (board.counts[i] !== 0) continue
    const next = Math.min(255, d.distance[i] + 1)
    for (const k of neighborsOf(board.width, board.height, i)) {
      const s = d.state[k]
      if (s === REVEALED || s === FLAGGED) continue
      d.state[k] = REVEALED
      d.distance[k] = next
      d.revealedCount++
      queue.push(k)
    }
  }
}

export function isWon(board: Pick<Board, 'revealedCount' | 'width' | 'height' | 'mineCount'>): boolean {
  return board.revealedCount === board.width * board.height - board.mineCount
}

/** Show every mine (except correctly flagged ones, which stay flagged). */
export function revealAllMines(board: Board): Board {
  const state = board.state.slice()
  for (let i = 0; i < state.length; i++) {
    if (board.mines[i] && state[i] !== FLAGGED) state[i] = REVEALED
  }
  return { ...board, state }
}

function finish(board: Board, d: Draft): Board {
  let next: Board = {
    ...board,
    state: d.state,
    distance: d.distance,
    revealedCount: d.revealedCount,
    status: 'playing',
  }
  if (d.hitMine >= 0) {
    next = revealAllMines({ ...next, status: 'lost', exploded: d.hitMine })
  } else if (isWon(next)) {
    // Flag whatever is left so the counter reads zero.
    const state = next.state.slice()
    for (let i = 0; i < state.length; i++) if (next.mines[i]) state[i] = FLAGGED
    next = { ...next, state, flagCount: next.mineCount, status: 'won' }
  }
  return next
}

/**
 * Reveal a cell. On the very first reveal the mines are placed with `seed`,
 * keeping the clicked cell and its neighbours clear.
 */
export function reveal(board: Board, i: number, seed: Seed = 0): Board {
  if (board.status === 'won' || board.status === 'lost') return board
  if (i < 0 || i >= board.width * board.height) return board
  const s = board.state[i]
  if (s === REVEALED || s === FLAGGED) return board

  const base = board.placed
    ? board
    : withMines(board, placeMines(board.width, board.height, board.mineCount, { safeIndex: i }, seed))

  const d = draftOf(base)
  floodReveal(base, d, i, 0)
  return finish(base, d)
}

/** Cycle hidden -> flagged -> question -> hidden. Revealed cells are untouched. */
export function toggleMark(board: Board, i: number): Board {
  if (board.status === 'won' || board.status === 'lost') return board
  const s = board.state[i]
  if (s === REVEALED) return board
  const state = board.state.slice()
  let flagCount = board.flagCount
  if (s === HIDDEN) {
    state[i] = FLAGGED
    flagCount++
  } else if (s === FLAGGED) {
    state[i] = QUESTION
    flagCount--
  } else {
    state[i] = HIDDEN
  }
  return { ...board, state, flagCount, status: board.status === 'idle' ? 'idle' : 'playing' }
}

/** Count flags touching `i`. */
export function adjacentFlags(board: Board, i: number): number {
  let n = 0
  for (const k of neighborsOf(board.width, board.height, i)) if (board.state[k] === FLAGGED) n++
  return n
}

/**
 * Chord: on a revealed number whose adjacent flag count matches it, open every
 * unflagged neighbour in one batch. A wrong flag means one of those neighbours
 * is a mine and the chord loses the game, exactly like the desktop original.
 */
export function chord(board: Board, i: number): Board {
  if (board.status === 'won' || board.status === 'lost') return board
  if (board.state[i] !== REVEALED) return board
  const n = board.counts[i]
  if (n === 0 || adjacentFlags(board, i) !== n) return board

  const d = draftOf(board)
  for (const k of neighborsOf(board.width, board.height, i)) {
    if (d.state[k] === REVEALED || d.state[k] === FLAGGED) continue
    if (board.mines[k]) {
      d.hitMine = k
      // Still open the safe neighbours so the loss state shows what was there.
      continue
    }
    floodReveal(board, d, k, 1)
  }
  if (d.revealedCount === board.revealedCount && d.hitMine < 0) return board
  return finish(board, d)
}

/** Convenience for the UI: acts like a left click on any cell. */
export function primaryAction(board: Board, i: number, seed: Seed): Board {
  return board.state[i] === REVEALED ? chord(board, i) : reveal(board, i, seed)
}
