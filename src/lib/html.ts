/**
 * Self-contained HTML reports. No network requests, no bundled libraries — the
 * output is one file you can open, email, or attach to a PR.
 *
 * Colours come from a validated palette (see README). The categorical slots used
 * by the composition strip clear the CVD and normal-vision gates in both light
 * and dark mode; three light-mode slots sit under 3:1 against the surface, which
 * is why every segment carries a labelled legend entry and a full table sits
 * below the chart rather than colour standing alone.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Categorical slots 1-6, light and dark steps of the same six hues. */
export const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
export const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300']

const STYLES = `
  .viz-root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --gridline: #e1e0d9;
    --baseline: #c3c2b7;
    --border: rgba(11, 11, 11, 0.10);
    --bar: #2a78d6;
    --neutral: #c3c2b7;
    --critical: #d03b3b;
    --good: #006300;
    --cat-1: #2a78d6; --cat-2: #eb6834; --cat-3: #1baf7a;
    --cat-4: #eda100; --cat-5: #e87ba4; --cat-6: #008300;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --gridline: #2c2c2a;
      --baseline: #383835;
      --border: rgba(255, 255, 255, 0.10);
      --bar: #3987e5;
      --neutral: #383835;
      --critical: #d03b3b;
      --good: #0ca30c;
      --cat-1: #3987e5; --cat-2: #d95926; --cat-3: #199e70;
      --cat-4: #c98500; --cat-5: #d55181; --cat-6: #008300;
    }
  }
  :root[data-theme="dark"] .viz-root {
    color-scheme: dark;
    --surface-1: #1a1a19;
    --page: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --baseline: #383835;
    --border: rgba(255, 255, 255, 0.10);
    --bar: #3987e5;
    --neutral: #383835;
    --critical: #d03b3b;
    --good: #0ca30c;
    --cat-1: #3987e5; --cat-2: #d95926; --cat-3: #199e70;
    --cat-4: #c98500; --cat-5: #d55181; --cat-6: #008300;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--text-primary);
  }
  .viz-root { padding: 32px 20px 64px; }
  .wrap { max-width: 880px; margin: 0 auto; }

  header { margin-bottom: 28px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.2px; }
  .path {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; color: var(--text-muted); word-break: break-all;
  }
  h2 {
    font-size: 13px; font-weight: 600; margin: 32px 0 12px;
    color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.6px;
  }

  .stats { display: flex; flex-wrap: wrap; gap: 28px; margin: 20px 0 4px; }
  .stat-label {
    font-size: 11px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px;
  }
  .stat-value { font-size: 22px; font-weight: 600; }
  .stat-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
  }

  /* Part-to-whole strip. 2px surface gaps keep adjacent fills from merging. */
  .strip { display: flex; gap: 2px; height: 30px; margin-bottom: 14px; }
  .strip span {
    display: block; height: 100%; min-width: 2px;
    border-radius: 2px; position: relative; cursor: default;
  }
  .strip span:first-child { border-radius: 4px 2px 2px 4px; }
  .strip span:last-child { border-radius: 2px 4px 4px 2px; }

  .legend { display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .legend div { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-secondary); }
  .swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }
  .legend b { font-weight: 500; color: var(--text-primary); }
  .legend em { font-style: normal; color: var(--text-muted); font-variant-numeric: tabular-nums; }

  /* Ranked magnitude bars: length carries the value, one hue throughout. */
  .rows { display: flex; flex-direction: column; gap: 9px; }
  .row { display: grid; grid-template-columns: 170px 1fr 78px 56px; gap: 12px; align-items: center; }
  .row .name {
    font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .row .name.dim { color: var(--text-muted); }
  .track { background: var(--gridline); border-radius: 4px; height: 14px; position: relative; }
  .fill { background: var(--bar); border-radius: 4px; height: 100%; min-width: 3px; }
  .fill.neutral { background: var(--neutral); }
  /* Split bar: useful and wasted are segments of the same length, 2px apart so
     adjacent fills never merge into one shape. */
  .bar { display: flex; gap: 2px; height: 100%; min-width: 3px; }
  .bar .fill { width: auto; min-width: 2px; }
  .fill.wasted { background: var(--critical); }
  .row .size, .row .share {
    font-size: 12px; text-align: right;
    font-variant-numeric: tabular-nums; color: var(--text-secondary);
  }
  .row .share { color: var(--text-muted); }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th {
    text-align: left; font-weight: 600; font-size: 11px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.6px;
    padding: 0 10px 8px 0; border-bottom: 1px solid var(--baseline);
  }
  td {
    padding: 7px 10px 7px 0; border-bottom: 1px solid var(--gridline);
    font-variant-numeric: tabular-nums; color: var(--text-secondary);
  }
  td:first-child {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-primary);
  }
  th.num, td.num { text-align: right; }
  td.bad { color: var(--critical); font-weight: 600; }
  td.ok { color: var(--good); }
  td.none { color: var(--text-muted); }

  .hint {
    margin-top: 14px; padding: 11px 14px; font-size: 12.5px; line-height: 1.5;
    background: var(--surface-1); border: 1px solid var(--border);
    border-left: 3px solid var(--bar); border-radius: 5px; color: var(--text-secondary);
  }
  .hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px; color: var(--text-primary);
  }

  /* Hover layer: CSS-only so the file stays script-free. */
  [data-tip] { position: relative; }
  [data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
    background: var(--text-primary); color: var(--surface-1);
    font-size: 11.5px; font-family: system-ui, sans-serif; white-space: nowrap;
    padding: 5px 9px; border-radius: 5px; pointer-events: none; z-index: 10;
    font-variant-numeric: tabular-nums;
  }

  footer { margin-top: 36px; font-size: 11.5px; color: var(--text-muted); }

  @media (max-width: 620px) {
    .row { grid-template-columns: 110px 1fr 68px; }
    .row .share { display: none; }
  }
`

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="viz-root"><div class="wrap">
${body}
<footer>Generated by rn-profiler</footer>
</div></div>
</body>
</html>
`
}
