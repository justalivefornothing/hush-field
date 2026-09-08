import { describe, expect, it } from 'vitest'
import {
  FLAGGED,
  HIDDEN,
  QUESTION,
  REVEALED,
  chord,
  countNeighbors,
  createBoard,
  indexOf,
  isWon,
  maxMines,
  neighborsOf,
  placeMines,
  reveal,
  toggleMark,
  withMines,
} from './board'
import { dailySeed, hashString, mulberry32 } from './rng'

/** Build a board with mines at the given (x, y) coordinates. */
function fixed(width: number, height: number, mineXY: Array<[number, number]>) {
  const mines = new Uint8Array(width * height)
  for (const [x, y] of mineXY) mines[y * width + x] = 1
  return withMines(createBoard(width, height, mineXY.length), mines)
}

function revealedIndices(state: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < state.length; i++) if (state[i] === REVEALED) out.push(i)
  return out
}

describe('placeMines', () => {
  it('never places a mine in cell 40 or its 8 neighbours across 200 seeds', () => {
    const safe = new Set([40, ...neighborsOf(9, 9, 40)])
    expect(safe.size).toBe(9)
    for (let seed = 0; seed < 200; seed++) {
      const mines = placeMines(9, 9, 10, { safeIndex: 40 }, `seed-${seed}`)
      let total = 0
      for (let i = 0; i < mines.length; i++) {
        total += mines[i]
        if (mines[i]) expect(safe.has(i)).toBe(false)
      }
      expect(total).toBe(10)
    }
  })

  it('is deterministic for a seed and differs across seeds', () => {
    const a = placeMines(16, 16, 40, { safeIndex: 0 }, 'hushfield')
    const b = placeMines(16, 16, 40, { safeIndex: 0 }, 'hushfield')
    const c = placeMines(16, 16, 40, { safeIndex: 0 }, 'hushfield-2')
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })

  it('respects the corner safe zone (only 4 cells excluded there)', () => {
    // 3x3 board, safe corner 0 excludes 0,1,3,4 -> 5 eligible cells.
    const mines = placeMines(3, 3, 5, { safeIndex: 0 }, 7)
    expect(Array.from(mines)).toEqual([0, 0, 1, 0, 0, 1, 1, 1, 1])
  })

  it('clamps the mine count to the eligible cells', () => {
    expect(maxMines(9, 9)).toBe(72)
    const mines = placeMines(3, 3, 99, { safeIndex: 4 }, 1)
    expect(mines.reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('countNeighbors', () => {
  it('gives the centre of a 3x3 board with mines at (0,0) and (2,2) a count of 2', () => {
    const mines = new Uint8Array(9)
    mines[0] = 1
    mines[8] = 1
    const counts = countNeighbors(3, 3, mines)
    expect(counts[4]).toBe(2)
    expect(Array.from(counts)).toEqual([0, 1, 0, 1, 2, 1, 0, 1, 0])
  })
})

describe('reveal', () => {
  it('flood-fills a 5x5 board with one corner mine from the far corner: 24 cells', () => {
    const board = fixed(5, 5, [[0, 0]])
    const next = reveal(board, indexOf(board, 4, 4))
    expect(next.revealedCount).toBe(24)
    expect(next.status).toBe('won')
    const zeros = revealedIndices(next.state).filter((i) => next.counts[i] === 0)
    expect(zeros).toHaveLength(21)
    // The mine itself stays covered (auto-flagged on win).
    expect(next.state[0]).toBe(FLAGGED)
  })

  it('records BFS distance radiating from the click', () => {
    const board = fixed(5, 5, [[0, 0]])
    const next = reveal(board, indexOf(board, 4, 4))
    expect(next.distance[indexOf(board, 4, 4)]).toBe(0)
    expect(next.distance[indexOf(board, 3, 3)]).toBe(1)
    expect(next.distance[indexOf(board, 2, 2)]).toBe(2)
    expect(next.distance[indexOf(board, 1, 1)]).toBe(3)
  })

  it('places mines on the first click, keeping the click and its ring clear', () => {
    const board = createBoard(9, 9, 10)
    expect(board.placed).toBe(false)
    const next = reveal(board, 40, 'first-click')
    expect(next.placed).toBe(true)
    expect(next.mines[40]).toBe(0)
    expect(next.counts[40]).toBe(0)
    for (const k of neighborsOf(9, 9, 40)) expect(next.mines[k]).toBe(0)
    expect(next.revealedCount).toBeGreaterThanOrEqual(9)
    expect(next.status).toBe('playing')
  })

  it('reveals only a numbered cell when it is not a zero', () => {
    const board = fixed(3, 3, [[0, 0]])
    const next = reveal(board, 1)
    expect(next.revealedCount).toBe(1)
    expect(next.state[1]).toBe(REVEALED)
  })

  it('does not flow through flags', () => {
    const board = fixed(5, 5, [[0, 0]])
    const flagged = toggleMark(board, indexOf(board, 2, 2))
    const next = reveal(flagged, indexOf(board, 4, 4))
    expect(next.state[indexOf(board, 2, 2)]).toBe(FLAGGED)
    expect(next.revealedCount).toBe(23)
    expect(next.status).toBe('playing')
  })

  it('loses on a mine and exposes every other mine', () => {
    const board = fixed(4, 4, [
      [0, 0],
      [3, 3],
    ])
    const next = reveal(board, 0)
    expect(next.status).toBe('lost')
    expect(next.exploded).toBe(0)
    expect(next.state[15]).toBe(REVEALED)
    // Game over boards ignore further input.
    expect(reveal(next, 5)).toBe(next)
    expect(toggleMark(next, 5)).toBe(next)
  })
})

describe('toggleMark', () => {
  it('cycles hidden -> flag -> question -> hidden and tracks flagCount', () => {
    const board = fixed(3, 3, [[0, 0]])
    const a = toggleMark(board, 8)
    expect(a.state[8]).toBe(FLAGGED)
    expect(a.flagCount).toBe(1)
    const b = toggleMark(a, 8)
    expect(b.state[8]).toBe(QUESTION)
    expect(b.flagCount).toBe(0)
    const c = toggleMark(b, 8)
    expect(c.state[8]).toBe(HIDDEN)
    expect(c.flagCount).toBe(0)
  })

  it('ignores revealed cells', () => {
    const board = reveal(fixed(3, 3, [[0, 0]]), 8)
    expect(toggleMark(board, 8)).toBe(board)
  })
})

describe('chord', () => {
  // 3x3, mine in the middle. Every edge cell has count 1.
  const centreMine = () => fixed(3, 3, [[1, 1]])

  it('reveals all unflagged neighbours when flags equal the number', () => {
    let board = reveal(centreMine(), 0) // corner shows "1"
    board = toggleMark(board, 4) // flag the mine
    const next = chord(board, 0)
    expect(next.state[1]).toBe(REVEALED)
    expect(next.state[3]).toBe(REVEALED)
    expect(next.state[4]).toBe(FLAGGED)
    expect(next.revealedCount).toBe(3)
    expect(next.status).toBe('playing')
  })

  it('reveals nothing when the flag count does not match', () => {
    const board = reveal(centreMine(), 0)
    expect(chord(board, 0)).toBe(board) // zero flags
    const over = toggleMark(toggleMark(board, 4), 1)
    expect(chord(over, 0)).toBe(over) // two flags around a 1
  })

  it('loses when a flag was wrong', () => {
    let board = reveal(centreMine(), 0)
    board = toggleMark(board, 1) // wrong flag
    const next = chord(board, 0)
    expect(next.status).toBe('lost')
    expect(next.exploded).toBe(4)
    expect(next.state[3]).toBe(REVEALED) // the safe neighbour still opens
  })

  it('cascades into zero regions it opens', () => {
    const board = fixed(5, 5, [[0, 0]])
    let b = reveal(board, indexOf(board, 1, 1)) // shows "1"
    b = toggleMark(b, 0)
    const next = chord(b, indexOf(board, 1, 1))
    expect(next.status).toBe('won')
    expect(next.revealedCount).toBe(24)
  })
})

describe('isWon', () => {
  it('is true when revealedCount === width*height - mineCount', () => {
    expect(isWon({ width: 9, height: 9, mineCount: 10, revealedCount: 71 })).toBe(true)
    expect(isWon({ width: 9, height: 9, mineCount: 10, revealedCount: 70 })).toBe(false)
  })

  it('auto-flags remaining mines on a win', () => {
    const won = reveal(fixed(3, 3, [[0, 0]]), 8)
    expect(won.status).toBe('won')
    expect(won.flagCount).toBe(1)
    expect(won.state[0]).toBe(FLAGGED)
  })
})

describe('rng', () => {
  it('hashes strings stably', () => {
    expect(hashString('hushfield')).toBe(hashString('hushfield'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('produces the same sequence for the same seed, in [0, 1)', () => {
    const a = mulberry32('x')
    const b = mulberry32('x')
    for (let i = 0; i < 20; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('formats the daily seed from the local date', () => {
    expect(dailySeed(new Date(2026, 8, 8))).toBe('daily-2026-09-08')
  })
})
