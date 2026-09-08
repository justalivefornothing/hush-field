# Hushfield — plan

A minesweeper rebuild with guaranteed-safe first click, flood-fill reveal, chord
clicks, and a seeded daily board.

## Goal

Rebuild minesweeper from scratch with the engine fully separated from React, so
every rule (deferred mine placement, flood fill, chording, win/loss) is a pure
function over a flat typed-array board and can be unit-tested with exact values.
The visual hook: the first click always lands on a zero, and the whole region
blooms open as a ripple that radiates from the cursor, staggered by BFS distance.

## Features

- Beginner (9x9/10), Intermediate (16x16/40), Expert (30x16/99) presets plus
  custom width, height, and mine count.
- Mines are placed after the first click, excluding the clicked cell and its
  8 neighbours, so the first click always opens a zero region.
- Iterative BFS flood-fill reveal of zero-neighbour regions; every revealed
  cell records its BFS distance so the UI can stagger the animation.
- Right-click cycles hidden -> flag -> question -> hidden. Chord: clicking a
  revealed number whose adjacent flag count equals it opens all unflagged
  neighbours in one batch.
- Seeded PRNG (mulberry32 over a string hash) so a shareable seed or today's
  date reproduces the same layout. The seed is reflected in the URL hash.
- Timer, remaining-mine counter, win/loss detection, mine reveal on loss with
  wrong flags marked.
- Keyboard navigation: arrows move a focus cursor, Space/Enter reveal or chord,
  F flags. Fully usable without a mouse.

## Architecture

```
src/
  engine/
    rng.ts        mulberry32 PRNG + string hash, seed helpers (daily seed)
    board.ts      flat Uint8Array board: placeMines, countNeighbors, reveal (BFS),
                  toggleMark, chord, isWon, revealAllMines
    board.test.ts vitest coverage incl. the five spec assertions
  ui/
    App.tsx       game shell: presets, seed input, status bar, board, help
    Board.tsx     grid rendering, pointer + keyboard input, ripple stagger
    Cell.tsx      one flat cell (memoised)
    useGame.ts    reducer-style hook wiring engine to React state + timer
  index.css      tailwind + design tokens (slate / mint, mono type)
```

Board state is a set of flat typed arrays (`mines`, `counts`, `state`,
`distance`) indexed by `y * width + x`. Cloning is a handful of `.slice()`
calls, so every engine function is pure: it returns a new board.

## Milestones

1. Plan, license, git init.
2. Vite + React + TS + Tailwind scaffold, template boilerplate removed.
3. Engine with tests (placement exclusion, BFS reveal count, neighbour counts,
   chord, win detection).
4. Playable board UI with presets, flags, chord, ripple reveal.
5. Seeds + daily board, timer, counter, keyboard navigation, custom sizes.
6. Build, smoke test, screenshot, README, publish.
