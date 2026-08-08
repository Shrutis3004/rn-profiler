import { basename } from 'node:path'
import type { Attribution } from './attribute.js'
import { UNMAPPED } from './packages.js'
import { formatBytes, formatPercent } from './format.js'
import { escapeHtml, page } from './html.js'

/** How many packages get their own colour in the composition strip before the tail folds into "other". */
const STRIP_SLOTS = 6

export function bundleHtml(attribution: Attribution, bundlePath: string, bundleBytes: number): string {
  const { packages, totalBytes, mappedBytes } = attribution
  const unmapped = totalBytes - mappedBytes

  const real = packages.filter((entry) => entry.name !== UNMAPPED)
  const head = real.slice(0, STRIP_SLOTS)
  const tail = real.slice(STRIP_SLOTS)
  const tailBytes = tail.reduce((sum, entry) => sum + entry.bytes, 0)

  const segments = [
    ...head.map((entry, index) => ({
      label: entry.name,
      bytes: entry.bytes,
      colour: `var(--cat-${index + 1})`,
    })),
    ...(tail.length > 0
      ? [{ label: `${tail.length} more packages`, bytes: tailBytes, colour: 'var(--neutral)' }]
      : []),
    ...(unmapped > 0
      ? [{ label: 'unmapped', bytes: unmapped, colour: 'var(--neutral)' }]
      : []),
  ]

  const strip = segments
    .map((segment) => {
      const share = formatPercent(segment.bytes, totalBytes)
      const tip = `${segment.label} — ${formatBytes(segment.bytes)} (${share})`
      return `<span style="flex:${segment.bytes};background:${segment.colour}" data-tip="${escapeHtml(tip)}"></span>`
    })
    .join('')

  const legend = segments
    .map(
      (segment) =>
        `<div><i class="swatch" style="background:${segment.colour}"></i>` +
        `<b>${escapeHtml(segment.label)}</b>` +
        `<em>${formatBytes(segment.bytes)}</em></div>`,
    )
    .join('')

  const largest = packages[0]?.bytes ?? 1
  const rows = packages
    .slice(0, 25)
    .map((entry) => {
      const isMeta = entry.name.startsWith('[')
      const width = Math.max((entry.bytes / largest) * 100, 0.4)
      const tip = `${entry.name} — ${formatBytes(entry.bytes)} across ${entry.fileCount} file${entry.fileCount === 1 ? '' : 's'}`
      return (
        `<div class="row">` +
        `<div class="name${isMeta ? ' dim' : ''}" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</div>` +
        `<div class="track" data-tip="${escapeHtml(tip)}"><div class="fill${isMeta ? ' neutral' : ''}" style="width:${width.toFixed(2)}%"></div></div>` +
        `<div class="size">${formatBytes(entry.bytes)}</div>` +
        `<div class="share">${formatPercent(entry.bytes, totalBytes)}</div>` +
        `</div>`
      )
    })
    .join('')

  const tableRows = packages
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.name)}</td>` +
        `<td class="num">${formatBytes(entry.bytes)}</td>` +
        `<td class="num">${formatPercent(entry.bytes, totalBytes)}</td>` +
        `<td class="num">${entry.fileCount === 0 ? '—' : entry.fileCount}</td></tr>`,
    )
    .join('')

  const biggest = real[0]

  const body = `
<header>
  <h1>Bundle report</h1>
  <div class="path">${escapeHtml(bundlePath)}</div>
</header>

<div class="stats">
  <div>
    <div class="stat-label">Bundle</div>
    <div class="stat-value">${formatBytes(bundleBytes)}</div>
  </div>
  <div>
    <div class="stat-label">Packages</div>
    <div class="stat-value">${real.length}</div>
    <div class="stat-sub">${formatBytes(mappedBytes)} attributed</div>
  </div>
  <div>
    <div class="stat-label">Unmapped</div>
    <div class="stat-value">${formatBytes(unmapped)}</div>
    <div class="stat-sub">${formatPercent(unmapped, totalBytes)} runtime and wrappers</div>
  </div>
</div>

<h2>Composition</h2>
<div class="card">
  <div class="strip">${strip}</div>
  <div class="legend">${legend}</div>
</div>

<h2>Largest first</h2>
<div class="card"><div class="rows">${rows}</div></div>
${
  biggest
    ? `<div class="hint"><b>${escapeHtml(biggest.name)}</b> is ${formatPercent(biggest.bytes, totalBytes)} of this bundle` +
      ` across ${biggest.fileCount} file${biggest.fileCount === 1 ? '' : 's'}. Save a baseline with` +
      ` <code>--json</code> before changing it, then <code>rn-profiler compare before.json after.json</code>` +
      ` to see exactly what the change bought you.</div>`
    : ''
}

<h2>All packages</h2>
<div class="card">
  <table>
    <thead><tr><th>Package</th><th class="num">Size</th><th class="num">Share</th><th class="num">Files</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>
`

  return page(`Bundle report — ${basename(bundlePath)}`, body)
}
