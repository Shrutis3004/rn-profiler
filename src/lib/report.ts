import Table from 'cli-table3'
import pc from 'picocolors'
import type { Attribution } from './attribute.js'
import { UNMAPPED } from './packages.js'
import { formatBytes, formatPercent } from './format.js'

export interface ReportOptions {
  top: number
}

export function renderTable(attribution: Attribution, options: ReportOptions): string {
  const { packages, totalBytes } = attribution

  const table = new Table({
    head: ['Package', 'Size', 'Share', 'Files'].map((h) => pc.bold(h)),
    colAligns: ['left', 'right', 'right', 'right'],
    style: { head: [], border: [], 'padding-left': 1, 'padding-right': 1 },
    // Every char blank: cli-table3 draws a rule between *every* row otherwise,
    // which buries the ranking under horizontal lines.
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: ' ',
    },
  })

  const shown = packages.slice(0, options.top)
  const hidden = packages.slice(options.top)

  for (const entry of shown) {
    const label = entry.name === UNMAPPED ? pc.dim(entry.name) : entry.name
    table.push([
      label,
      formatBytes(entry.bytes),
      formatPercent(entry.bytes, totalBytes),
      entry.fileCount === 0 ? pc.dim('—') : String(entry.fileCount),
    ])
  }

  if (hidden.length > 0) {
    const hiddenBytes = hidden.reduce((sum, entry) => sum + entry.bytes, 0)
    table.push([
      pc.dim(`${hidden.length} more`),
      pc.dim(formatBytes(hiddenBytes)),
      pc.dim(formatPercent(hiddenBytes, totalBytes)),
      pc.dim('—'),
    ])
  }

  return table.toString()
}

export function renderSummary(attribution: Attribution, bundleBytes: number): string {
  const { totalBytes, mappedBytes, packages } = attribution
  const unmapped = totalBytes - mappedBytes
  const lines = [
    `  ${pc.dim('bundle')}     ${formatBytes(bundleBytes)}`,
    `  ${pc.dim('attributed')} ${formatBytes(mappedBytes)} across ${packages.length - (unmapped > 0 ? 1 : 0)} packages`,
    `  ${pc.dim('unmapped')}   ${formatBytes(unmapped)} ${pc.dim(`(${formatPercent(unmapped, totalBytes)} — runtime, polyfills, module wrappers)`)}`,
  ]
  return lines.join('\n')
}
