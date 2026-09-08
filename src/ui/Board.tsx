import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import type { Board as BoardState } from '../engine/board'
import { Cell } from './Cell'

interface Props {
  board: BoardState
  cursor: number
  onPrimary: (i: number) => void
  onChord: (i: number) => void
  onMark: (i: number) => void
  onMove: (dx: number, dy: number) => void
  onNewGame: () => void
}

const LONG_PRESS_MS = 420

function cellIndex(target: EventTarget | null): number {
  const el = (target as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null
  return el ? Number(el.dataset.i) : -1
}

export function Board({ board, cursor, onPrimary, onChord, onMark, onMove, onNewGame }: Props) {
  const press = useRef<{ index: number; type: string; timer: number; held: boolean } | null>(null)
  const lastPointerType = useRef('mouse')

  const clearPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }, [])
  useEffect(() => clearPress, [clearPress])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = cellIndex(e.target)
    if (i < 0) return
    if (e.button === 1) e.preventDefault() // no autoscroll on middle-click chords
    lastPointerType.current = e.pointerType
    clearPress()
    const entry = { index: i, type: e.pointerType, timer: 0, held: false }
    if (e.pointerType !== 'mouse' && e.button === 0) {
      // Long-press on touch/pen = flag, since there is no right button.
      entry.timer = window.setTimeout(() => {
        entry.held = true
        onMark(i)
        navigator.vibrate?.(12)
      }, LONG_PRESS_MS)
    }
    press.current = entry
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const started = press.current
    clearPress()
    if (!started || started.held) return
    const i = cellIndex(e.target)
    if (i < 0 || i !== started.index) return
    if (e.button === 0) onPrimary(i)
    else if (e.button === 1) onChord(i)
  }

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (lastPointerType.current !== 'mouse') return
    const i = cellIndex(e.target)
    if (i >= 0) onMark(i)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (e.key in moves) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      onMove(dx, dy)
      return
    }
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault()
        onPrimary(cursor)
        break
      case 'f':
      case 'F':
        e.preventDefault()
        onMark(cursor)
        break
      case 'n':
      case 'N':
        e.preventDefault()
        onNewGame()
        break
    }
  }

  const { width, height, state, counts, mines, distance, status, exploded } = board
  const lost = status === 'lost'
  const style = { '--cols': width, '--rows': height } as CSSProperties

  const rows = []
  for (let y = 0; y < height; y++) {
    const cells = []
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      cells.push(
        <Cell
          key={i}
          index={i}
          x={x}
          y={y}
          state={state[i]}
          count={counts[i]}
          mine={mines[i] === 1}
          distance={distance[i]}
          exploded={exploded === i}
          cursor={cursor === i}
          lost={lost}
        />,
      )
    }
    rows.push(
      <div role="row" key={y} className="contents">
        {cells}
      </div>,
    )
  }

  return (
    <div className="board-scroll">
      <div
        role="grid"
        aria-label={`Minefield, ${width} by ${height}, ${board.mineCount} mines`}
        aria-rowcount={height}
        aria-colcount={width}
        tabIndex={0}
        className="board"
        style={style}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
      >
        {rows}
      </div>
    </div>
  )
}
