import { useEffect, useState, type FormEvent } from 'react'
import { FLAGGED, maxMines } from './engine/board'
import { dailySeed } from './engine/rng'
import { formatTime, useBestTimes } from './game/bestTimes'
import { LIMITS, PRESETS, presetFor, sanitize, type Config, type PresetKey } from './game/presets'
import { useGame } from './game/useGame'
import { Board } from './ui/Board'

const PRESET_LABELS: Array<[PresetKey, string]> = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['expert', 'Expert'],
  ['custom', 'Custom'],
]

const STATUS_WORD = { idle: 'ready', playing: 'sweeping', won: 'cleared', lost: 'boom' } as const

function pad3(n: number): string {
  if (n < 0) return `-${String(Math.min(99, -n)).padStart(2, '0')}`
  return String(Math.min(999, n)).padStart(3, '0')
}

export default function App() {
  const game = useGame()
  const { board, config, seed, cursor, flagMode } = game.state
  const preset = presetFor(config)
  const isDaily = seed === dailySeed()
  const { bestFor, isNewBest } = useBestTimes(board, config, game.elapsedMs)

  const [customOpen, setCustomOpen] = useState(preset === 'custom')
  const [seedDraft, setSeedDraft] = useState(seed)
  const [copied, setCopied] = useState(false)
  useEffect(() => setSeedDraft(seed), [seed])

  const commitSeed = () => {
    const next = seedDraft.trim()
    if (!next) setSeedDraft(seed)
    else if (next !== seed) game.newGame(undefined, next)
  }

  const choosePreset = (key: PresetKey) => {
    if (key === 'custom') {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    game.newGame(PRESETS[key])
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable: the URL bar already holds the link */
    }
  }

  const remaining = board.mineCount - board.flagCount
  const seconds = Math.floor(game.elapsedMs / 1000)
  const status = board.status

  let outcome: string
  if (status === 'won') outcome = `Cleared in ${formatTime(game.elapsedMs)}.${isNewBest ? ' New personal best.' : ''}`
  else if (status === 'lost') {
    const x = (board.exploded % board.width) + 1
    const y = Math.floor(board.exploded / board.width) + 1
    let wrong = 0
    for (let i = 0; i < board.state.length; i++) if (board.state[i] === FLAGGED && !board.mines[i]) wrong++
    outcome = `Boom. A mine at row ${y}, column ${x}.`
    if (wrong > 0) outcome += ` ${wrong} wrong ${wrong === 1 ? 'flag is' : 'flags are'} marked.`
  } else if (status === 'idle') outcome = 'Your first click is always safe and always opens a region.'
  else outcome = flagMode ? 'Flag mode: clicks place flags.' : 'Click a satisfied number to chord its neighbours.'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-mint-400 sm:text-3xl">
            Hushfield<span className="text-ink-300">_</span>
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-300">
            Minesweeper with a guaranteed-safe first click, flood-fill reveal, chord clicks, and a seeded
            daily board.
          </p>
        </div>
        {isDaily && (
          <span className="pill">
            <span className="dot" /> today&apos;s board
          </span>
        )}
      </header>

      <section className="panel flex flex-col gap-3" aria-label="Board settings">
        <div role="group" aria-label="Difficulty" className="seg">
          {PRESET_LABELS.map(([key, label]) => {
            const active = key === 'custom' ? customOpen || preset === 'custom' : preset === key && !customOpen
            const c = key === 'custom' ? null : PRESETS[key]
            const best = c ? bestFor(c) : undefined
            return (
              <button
                key={key}
                type="button"
                className={`seg__btn${active ? ' seg__btn--active' : ''}`}
                aria-pressed={active}
                onClick={() => choosePreset(key)}
              >
                <span>{label}</span>
                {c && (
                  <span className="seg__meta">
                    {c.width}×{c.height} · {c.mines}
                    {best !== undefined && ` · best ${formatTime(best)}`}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {customOpen && <CustomForm config={config} onApply={(c) => game.newGame(c)} />}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-[13px] text-ink-300">
            <span className="shrink-0">seed</span>
            <input
              className="field min-w-0 flex-1"
              value={seedDraft}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setSeedDraft(e.target.value)}
              onBlur={commitSeed}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              aria-label="Board seed"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={game.today} disabled={isDaily && status === 'idle'}>
              Today
            </button>
            <button type="button" className="btn" onClick={game.shuffle}>
              Shuffle
            </button>
            <button type="button" className="btn" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col items-center" aria-label="Game">
        <div className="table">
          <div className="statusbar">
            <span className="readout" title="Mines left">
              <FlagIcon />
              <span>{pad3(remaining)}</span>
            </span>
            <button
              type="button"
              className={`status status--${status}`}
              onClick={() => game.newGame()}
              title="Restart this board (same seed)"
            >
              <span className="dot" />
              {STATUS_WORD[status]}
            </button>
            <span className="readout" title="Seconds">
              <span>{pad3(seconds)}</span>
              <ClockIcon />
            </span>
          </div>

          <Board
            board={board}
            cursor={cursor}
            onPrimary={game.primary}
            onChord={game.chord}
            onMark={game.mark}
            onMove={game.move}
            onNewGame={game.shuffle}
          />

          <div className="table__row flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <p
              className={`min-w-0 flex-1 text-[13px] leading-snug ${
                status === 'lost' ? 'text-danger' : status === 'won' ? 'text-mint-300' : 'text-ink-300'
              }`}
              aria-live="polite"
            >
              {outcome}
            </p>
            <label className="toggle">
              <input type="checkbox" checked={flagMode} onChange={(e) => game.setFlagMode(e.target.checked)} />
              <span className="toggle__track" aria-hidden="true" />
              flag mode
            </label>
          </div>
        </div>
      </section>

      <footer className="help">
        <Key k="click">reveal</Key>
        <Key k="right-click / hold">flag → ? → clear</Key>
        <Key k="click a number">chord</Key>
        <Key k="↑ ↓ ← →">move</Key>
        <Key k="space">reveal / chord</Key>
        <Key k="F">flag</Key>
        <Key k="N">new board</Key>
      </footer>
    </div>
  )
}

function Key({ k, children }: { k: string; children: string }) {
  return (
    <span className="help__item">
      <kbd>{k}</kbd>
      <span>{children}</span>
    </span>
  )
}

function CustomForm({ config, onApply }: { config: Config; onApply: (c: Config) => void }) {
  const [draft, setDraft] = useState({
    width: String(config.width),
    height: String(config.height),
    mines: String(config.mines),
  })
  const w = Number(draft.width) || 0
  const h = Number(draft.height) || 0
  const cap = w >= LIMITS.minSize && h >= LIMITS.minSize ? maxMines(w, h) : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = sanitize({ width: w, height: h, mines: Number(draft.mines) || 0 })
    setDraft({ width: String(next.width), height: String(next.height), mines: String(next.mines) })
    onApply(next)
  }

  const field = (key: keyof typeof draft, label: string, min: number, max: number) => (
    <label className="flex items-center gap-2 text-[13px] text-ink-300">
      <span className="w-12">{label}</span>
      <input
        className="field w-20"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        aria-label={label}
      />
    </label>
  )

  return (
    <form className="flex flex-wrap items-center gap-3 rounded-md border border-ink-600 bg-ink-900/60 p-3" onSubmit={submit}>
      {field('width', 'width', LIMITS.minSize, LIMITS.maxWidth)}
      {field('height', 'height', LIMITS.minSize, LIMITS.maxHeight)}
      {field('mines', 'mines', 1, cap ?? 1)}
      <span className="text-[12px] text-ink-300">
        {cap === null ? `min ${LIMITS.minSize}×${LIMITS.minSize}` : `max ${cap} mines`}
      </span>
      <button type="submit" className="btn btn--primary ml-auto">
        Start custom
      </button>
    </form>
  )
}

const FlagIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
    <path d="M5 2.5v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M5.8 3h6.4l-2.2 2.7 2.2 2.8H5.8z" fill="currentColor" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
