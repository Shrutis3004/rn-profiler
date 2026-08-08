import Table from 'cli-table3'
import pc from 'picocolors'
import type { PropsEvent, RenderEvent } from '../shared/events.js'

export interface ComponentStats {
  id: string
  mounts: number
  updates: number
  totalMs: number
  slowestMs: number
  /** Re-renders where no prop changed. Only counted for components using useRenderTracker. */
  wasted: number
  /** Re-renders seen by useRenderTracker, wasted or not. */
  tracked: number
}

export class RenderAggregator {
  private readonly stats = new Map<string, ComponentStats>()

  private entry(id: string): ComponentStats {
    let existing = this.stats.get(id)
    if (!existing) {
      existing = { id, mounts: 0, updates: 0, totalMs: 0, slowestMs: 0, wasted: 0, tracked: 0 }
      this.stats.set(id, existing)
    }
    return existing
  }

  addRenders(events: RenderEvent[]): void {
    for (const event of events) {
      const entry = this.entry(event.id)
      if (event.phase === 'mount') entry.mounts += 1
      else entry.updates += 1
      entry.totalMs += event.actualDuration
      entry.slowestMs = Math.max(entry.slowestMs, event.actualDuration)
    }
  }

  addProps(events: PropsEvent[]): void {
    for (const event of events) {
      const entry = this.entry(event.id)
      entry.tracked += 1
      if (event.changed.length === 0) entry.wasted += 1
    }
  }

  get totalCommits(): number {
    let total = 0
    for (const entry of this.stats.values()) total += entry.mounts + entry.updates
    return total
  }

  get isEmpty(): boolean {
    return this.stats.size === 0
  }

  /** Worst first: provably wasted renders outrank merely frequent ones. */
  ranked(): ComponentStats[] {
    return [...this.stats.values()].sort((a, b) => {
      if (b.wasted !== a.wasted) return b.wasted - a.wasted
      if (b.updates !== a.updates) return b.updates - a.updates
      return b.totalMs - a.totalMs
    })
  }
}

function ms(value: number): string {
  if (value < 1) return `${value.toFixed(2)} ms`
  if (value < 100) return `${value.toFixed(1)} ms`
  return `${Math.round(value)} ms`
}

export function renderRenderTable(rows: ComponentStats[]): string {
  const table = new Table({
    head: ['Component', 'Mounts', 'Updates', 'Wasted', 'Total', 'Slowest'].map((h) => pc.bold(h)),
    colAligns: ['left', 'right', 'right', 'right', 'right', 'right'],
    style: { head: [], border: [], 'padding-left': 1, 'padding-right': 1 },
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: ' ',
    },
  })

  for (const row of rows) {
    const wasted =
      row.tracked === 0
        ? pc.dim('—')
        : row.wasted === 0
          ? pc.green('0')
          : pc.red(`${row.wasted}/${row.tracked}`)

    table.push([
      row.id,
      String(row.mounts),
      String(row.updates),
      wasted,
      ms(row.totalMs),
      ms(row.slowestMs),
    ])
  }

  return table.toString()
}

export function renderHints(rows: ComponentStats[]): string[] {
  const hints: string[] = []

  const worstWasted = rows.find((row) => row.wasted > 0)
  if (worstWasted) {
    hints.push(
      `${pc.bold(worstWasted.id)} re-rendered ${worstWasted.wasted} times with no prop change — ` +
        `wrap it in React.memo, or memoise what the parent passes it.`,
    )
  }

  const untracked = rows.filter((row) => row.tracked === 0 && row.updates > 20)
  if (untracked.length > 0) {
    hints.push(
      `${untracked.map((row) => pc.bold(row.id)).join(', ')} updated often but ` +
        `${pc.dim('Wasted')} is unknown — add useRenderTracker to see whether the props actually changed.`,
    )
  }

  return hints
}
