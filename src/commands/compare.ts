import { readFile } from 'node:fs/promises'
import Table from 'cli-table3'
import type { Command } from 'commander'
import pc from 'picocolors'
import type { PackageSize } from '../lib/attribute.js'
import { formatBytes } from '../lib/format.js'

interface Snapshot {
  bundleBytes: number
  totalBytes: number
  packages: PackageSize[]
}

async function readSnapshot(path: string): Promise<Snapshot> {
  const raw = await readFile(path, 'utf8')
  let parsed: Snapshot
  try {
    parsed = JSON.parse(raw) as Snapshot
  } catch {
    throw new Error(`${path} is not valid JSON — produce it with: rn-profiler bundle <bundle> --json`)
  }
  if (!Array.isArray(parsed.packages)) {
    throw new Error(`${path} has no "packages" array — was it produced by rn-profiler bundle --json?`)
  }
  return parsed
}

function signed(bytes: number): string {
  const formatted = formatBytes(Math.abs(bytes))
  if (bytes > 0) return pc.red(`+${formatted}`)
  if (bytes < 0) return pc.green(`-${formatted}`)
  return pc.dim('0 B')
}

export function registerCompareCommand(program: Command): void {
  program
    .command('compare')
    .description('Diff two --json snapshots to see what a dependency change cost')
    .argument('<before>', 'baseline JSON from `rn-profiler bundle --json`')
    .argument('<after>', 'new JSON from `rn-profiler bundle --json`')
    .option('--all', 'show packages whose size did not change')
    .action(async (beforePath: string, afterPath: string, options: { all?: boolean }) => {
      const [before, after] = await Promise.all([readSnapshot(beforePath), readSnapshot(afterPath)])

      const names = new Set([
        ...before.packages.map((entry) => entry.name),
        ...after.packages.map((entry) => entry.name),
      ])

      const beforeByName = new Map(before.packages.map((entry) => [entry.name, entry.bytes]))
      const afterByName = new Map(after.packages.map((entry) => [entry.name, entry.bytes]))

      const rows = [...names]
        .map((name) => {
          const from = beforeByName.get(name) ?? 0
          const to = afterByName.get(name) ?? 0
          return { name, from, to, delta: to - from }
        })
        .filter((row) => options.all || row.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

      const table = new Table({
        head: ['Package', 'Before', 'After', 'Change'].map((h) => pc.bold(h)),
        colAligns: ['left', 'right', 'right', 'right'],
        style: { head: [], border: [], 'padding-left': 1, 'padding-right': 1 },
        chars: {
          top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
          bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
          left: '', 'left-mid': '', mid: '', 'mid-mid': '',
          right: '', 'right-mid': '', middle: ' ',
        },
      })

      for (const row of rows) {
        table.push([
          row.from === 0 ? pc.green(`${row.name} (new)`) : row.to === 0 ? pc.dim(`${row.name} (gone)`) : row.name,
          row.from === 0 ? pc.dim('—') : formatBytes(row.from),
          row.to === 0 ? pc.dim('—') : formatBytes(row.to),
          signed(row.delta),
        ])
      }

      const totalDelta = after.totalBytes - before.totalBytes

      console.log()
      if (rows.length === 0) {
        console.log(pc.dim('  No package changed size.'))
      } else {
        console.log(table.toString())
      }
      console.log()
      console.log(`  ${pc.bold('Total')}  ${formatBytes(before.totalBytes)} → ${formatBytes(after.totalBytes)}  ${signed(totalDelta)}`)
      console.log()
    })
}
