import type { ComponentStats } from './renderReport.js'
import { escapeHtml, page } from './html.js'

function ms(value: number): string {
  if (value < 1) return `${value.toFixed(2)} ms`
  if (value < 100) return `${value.toFixed(1)} ms`
  return `${Math.round(value)} ms`
}

export function rendersHtml(rows: ComponentStats[], app?: string): string {
  const totalCommits = rows.reduce((sum, row) => sum + row.mounts + row.updates, 0)
  const totalWasted = rows.reduce((sum, row) => sum + row.wasted, 0)
  const totalTracked = rows.reduce((sum, row) => sum + row.tracked, 0)
  const busiest = Math.max(1, ...rows.map((row) => row.mounts + row.updates))

  const bars = rows
    .slice(0, 25)
    .map((row) => {
      const commits = row.mounts + row.updates
      // Both segments share the same scale as the bar itself, so wasted can never
      // read as longer than the commits it is part of.
      const width = Math.max((commits / busiest) * 100, 0.4)
      const wasted = Math.min(row.wasted, commits)
      const useful = commits - wasted
      // Wasted renders are a state, not a series, so they carry the status colour.
      const tip =
        row.tracked > 0
          ? `${row.id} — ${commits} commits, ${wasted} wasted`
          : `${row.id} — ${commits} commits, wasted unknown`
      return (
        `<div class="row">` +
        `<div class="name" title="${escapeHtml(row.id)}">${escapeHtml(row.id)}</div>` +
        `<div class="track" data-tip="${escapeHtml(tip)}">` +
        `<div class="bar" style="width:${width.toFixed(2)}%">` +
        (useful > 0 ? `<div class="fill" style="flex:${useful}"></div>` : '') +
        (wasted > 0 ? `<div class="fill wasted" style="flex:${wasted}"></div>` : '') +
        `</div>` +
        `</div>` +
        `<div class="size">${commits}</div>` +
        `<div class="share">${ms(row.totalMs)}</div>` +
        `</div>`
      )
    })
    .join('')

  const tableRows = rows
    .map((row) => {
      const wastedCell =
        row.tracked === 0
          ? '<td class="num none">—</td>'
          : row.wasted === 0
            ? '<td class="num ok">0</td>'
            : `<td class="num bad">${row.wasted}/${row.tracked}</td>`
      return (
        `<tr><td>${escapeHtml(row.id)}</td>` +
        `<td class="num">${row.mounts}</td>` +
        `<td class="num">${row.updates}</td>` +
        wastedCell +
        `<td class="num">${ms(row.totalMs)}</td>` +
        `<td class="num">${ms(row.slowestMs)}</td></tr>`
      )
    })
    .join('')

  const worst = rows.find((row) => row.wasted > 0)
  const unknown = rows.filter((row) => row.tracked === 0 && row.updates > 20)

  const body = `
<header>
  <h1>Render report</h1>
  <div class="path">${escapeHtml(app ?? 'React Native app')}</div>
</header>

<div class="stats">
  <div>
    <div class="stat-label">Commits</div>
    <div class="stat-value">${totalCommits}</div>
  </div>
  <div>
    <div class="stat-label">Components</div>
    <div class="stat-value">${rows.length}</div>
  </div>
  <div>
    <div class="stat-label">Wasted</div>
    <div class="stat-value">${totalTracked === 0 ? '—' : totalWasted}</div>
    <div class="stat-sub">${
      totalTracked === 0
        ? 'add useRenderTracker to measure'
        : `of ${totalTracked} tracked re-renders`
    }</div>
  </div>
</div>

<h2>Busiest components</h2>
<div class="card">
  <div class="rows">${bars}</div>
  <div class="legend" style="margin-top:16px">
    <div><i class="swatch" style="background:var(--bar)"></i><b>commits</b></div>
    <div><i class="swatch" style="background:var(--critical)"></i><b>wasted</b><em>no prop changed</em></div>
  </div>
</div>
${
  worst
    ? `<div class="hint"><b>${escapeHtml(worst.id)}</b> re-rendered ${worst.wasted} times with no prop change.` +
      ` Wrap it in <code>React.memo</code>, or memoise what the parent hands it —` +
      ` an object or arrow function built inline in the parent is a new value on every render.</div>`
    : ''
}
${
  unknown.length > 0
    ? `<div class="hint">${unknown.map((row) => `<b>${escapeHtml(row.id)}</b>`).join(', ')} updated often, but` +
      ` whether those renders were wasted is unknown. Add <code>useRenderTracker</code> to find out.</div>`
    : ''
}

<h2>All components</h2>
<div class="card">
  <table>
    <thead><tr><th>Component</th><th class="num">Mounts</th><th class="num">Updates</th><th class="num">Wasted</th><th class="num">Total</th><th class="num">Slowest</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>
`

  return page(`Render report${app ? ` — ${app}` : ''}`, body)
}
