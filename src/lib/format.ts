/** Human-readable byte sizes. Uses kB/MB (1000-based) to match what bundlers report. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} kB`
  return `${(bytes / 1000 / 1000).toFixed(2)} MB`
}

export function formatPercent(part: number, whole: number): string {
  if (whole === 0) return '0.0%'
  return `${((part / whole) * 100).toFixed(1)}%`
}
