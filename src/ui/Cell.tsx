import { memo, type CSSProperties, type ReactNode } from 'react'
import { FLAGGED, QUESTION, REVEALED } from '../engine/board'

export interface CellProps {
  index: number
  x: number
  y: number
  state: number
  count: number
  mine: boolean
  distance: number
  exploded: boolean
  cursor: boolean
  lost: boolean
}

function describe(p: CellProps): string {
  const where = `row ${p.y + 1} column ${p.x + 1}`
  if (p.lost && p.mine && p.state !== FLAGGED) return `${where}, ${p.exploded ? 'exploded mine' : 'mine'}`
  if (p.state === FLAGGED) return `${where}, ${p.lost && !p.mine ? 'wrong flag' : 'flagged'}`
  if (p.state === QUESTION) return `${where}, question mark`
  if (p.state === REVEALED) return `${where}, ${p.count === 0 ? 'empty' : `${p.count} adjacent`}`
  return `${where}, hidden`
}

const FlagGlyph = () => (
  <svg viewBox="0 0 16 16" className="glyph" aria-hidden="true">
    <path d="M5 2.5v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M5.8 3h6.4l-2.2 2.7 2.2 2.8H5.8z" fill="currentColor" />
  </svg>
)

const MineGlyph = () => (
  <svg viewBox="0 0 16 16" className="glyph" aria-hidden="true">
    <circle cx="8" cy="8" r="3.6" fill="currentColor" />
    <path
      d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M12.6 3.4l-2.1 2.1M5.5 10.5l-2.1 2.1"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
)

function CellView(p: CellProps) {
  const open = p.state === REVEALED
  const showMine = open && p.mine
  const wrongFlag = p.lost && p.state === FLAGGED && !p.mine

  let cls = 'cell'
  if (showMine) cls += p.exploded ? ' cell--boom' : ' cell--mine'
  else if (open) cls += ' cell--open'
  else cls += ' cell--hidden'
  if (p.state === FLAGGED) cls += wrongFlag ? ' cell--wrong' : ' cell--flag'
  if (p.state === QUESTION) cls += ' cell--q'
  if (p.cursor) cls += ' cell--cursor'

  const style = { '--d': p.distance } as CSSProperties

  let content: ReactNode = null
  if (showMine) content = <MineGlyph />
  else if (p.state === FLAGGED) content = <FlagGlyph />
  else if (p.state === QUESTION) content = '?'
  else if (open && p.count > 0) content = p.count

  return (
    <div
      role="gridcell"
      data-i={p.index}
      data-n={open && !showMine && p.count > 0 ? p.count : undefined}
      className={cls}
      style={style}
      aria-label={describe(p)}
    >
      {content !== null && <span className="cell__glyph">{content}</span>}
    </div>
  )
}

export const Cell = memo(CellView)
