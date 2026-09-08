import { useCallback, useEffect, useReducer, useState } from 'react'
import { REVEALED, chord, createBoard, primaryAction, toggleMark, type Board } from '../engine/board'
import { dailySeed, randomSeed } from '../engine/rng'
import { PRESETS, decodeHash, encodeHash, sanitize, type Config } from './presets'

export interface GameState {
  config: Config
  seed: string
  board: Board
  cursor: number
  flagMode: boolean
  startedAt: number | null
  endedAt: number | null
}

type Action =
  | { type: 'new'; config?: Config; seed?: string }
  | { type: 'primary'; index: number; now: number }
  | { type: 'chord'; index: number; now: number }
  | { type: 'mark'; index: number }
  | { type: 'cursor'; index: number }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'flagMode'; on: boolean }

function fresh(config: Config, seed: string, cursor = 0): GameState {
  const c = sanitize(config)
  return {
    config: c,
    seed,
    board: createBoard(c.width, c.height, c.mines),
    cursor: Math.min(cursor, c.width * c.height - 1),
    flagMode: false,
    startedAt: null,
    endedAt: null,
  }
}

function initial(): GameState {
  const fromUrl = typeof location !== 'undefined' ? decodeHash(location.hash) : null
  const config = fromUrl?.config ?? PRESETS.beginner
  const seed = fromUrl?.seed ?? dailySeed()
  const centre = Math.floor(config.height / 2) * config.width + Math.floor(config.width / 2)
  return fresh(config, seed, centre)
}

/** Apply a board transition and keep the clock in step with the status change. */
function withBoard(state: GameState, board: Board, now: number): GameState {
  if (board === state.board) return state
  const started = state.board.status === 'idle' && board.status !== 'idle'
  const ended = board.status === 'won' || board.status === 'lost'
  return {
    ...state,
    board,
    startedAt: started ? now : state.startedAt,
    endedAt: ended && state.endedAt === null ? now : state.endedAt,
  }
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'new': {
      const config = action.config ?? state.config
      const seed = action.seed ?? state.seed
      const next = fresh(config, seed, state.cursor)
      return { ...next, flagMode: state.flagMode }
    }
    case 'primary': {
      // Flag mode turns plain clicks into flags, but chording a number still works.
      const flagging = state.flagMode && state.board.state[action.index] !== REVEALED
      const board = flagging
        ? toggleMark(state.board, action.index)
        : primaryAction(state.board, action.index, state.seed)
      return { ...withBoard(state, board, action.now), cursor: action.index }
    }
    case 'chord':
      return { ...withBoard(state, chord(state.board, action.index), action.now), cursor: action.index }
    case 'mark':
      return { ...state, board: toggleMark(state.board, action.index), cursor: action.index }
    case 'cursor':
      return state.cursor === action.index ? state : { ...state, cursor: action.index }
    case 'move': {
      const { width, height } = state.board
      const x = Math.min(width - 1, Math.max(0, (state.cursor % width) + action.dx))
      const y = Math.min(height - 1, Math.max(0, Math.floor(state.cursor / width) + action.dy))
      return { ...state, cursor: y * width + x }
    }
    case 'flagMode':
      return { ...state, flagMode: action.on }
  }
}

export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initial)
  const [now, setNow] = useState(() => Date.now())

  // Tick the clock only while a game is live.
  const live = state.board.status === 'playing'
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [live])

  // Keep the URL shareable.
  useEffect(() => {
    const hash = encodeHash(state.config, state.seed)
    if (location.hash !== hash) history.replaceState(null, '', hash)
  }, [state.config, state.seed])

  const elapsedMs =
    state.startedAt === null ? 0 : Math.max(0, (state.endedAt ?? now) - state.startedAt)

  const actions = {
    newGame: useCallback((config?: Config, seed?: string) => dispatch({ type: 'new', config, seed }), []),
    shuffle: useCallback(() => dispatch({ type: 'new', seed: randomSeed() }), []),
    today: useCallback(() => dispatch({ type: 'new', seed: dailySeed() }), []),
    primary: useCallback((index: number) => dispatch({ type: 'primary', index, now: Date.now() }), []),
    chord: useCallback((index: number) => dispatch({ type: 'chord', index, now: Date.now() }), []),
    mark: useCallback((index: number) => dispatch({ type: 'mark', index }), []),
    setCursor: useCallback((index: number) => dispatch({ type: 'cursor', index }), []),
    move: useCallback((dx: number, dy: number) => dispatch({ type: 'move', dx, dy }), []),
    setFlagMode: useCallback((on: boolean) => dispatch({ type: 'flagMode', on }), []),
  }

  return { state, elapsedMs, ...actions }
}

export type GameActions = Omit<ReturnType<typeof useGame>, 'state' | 'elapsedMs'>
