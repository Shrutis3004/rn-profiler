# rn-profiler

**Find out what is making your React Native app big, and what is making it slow.**

[![CI](https://github.com/Shrutis3004/rn-profiler/actions/workflows/ci.yml/badge.svg)](https://github.com/Shrutis3004/rn-profiler/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/rn-profiler.svg)](https://www.npmjs.com/package/rn-profiler)
[![npm downloads](https://img.shields.io/npm/dw/rn-profiler.svg)](https://www.npmjs.com/package/rn-profiler)
[![license](https://img.shields.io/npm/l/rn-profiler.svg)](./LICENSE)

Metro tells you your bundle is 3.6 MB. It will not tell you that 36% of it is an icon library you
import three icons from. This does.

![Bundle report](https://raw.githubusercontent.com/Shrutis3004/rn-profiler/main/docs/bundle-report.png)

---

## Try it in 30 seconds

No install, no config, no changes to your app:

```bash
# 1. Package your app and ask for the source map too
npx expo export:embed --platform ios --dev false \
  --bundle-output /tmp/app.js --sourcemap-output /tmp/app.js.map

# 2. Point the tool at it
npx rn-profiler bundle /tmp/app.js
```

That prints a ranked list of every library in your app and what it costs you.

<details>
<summary>Not using Expo?</summary>

```bash
npx react-native bundle --platform ios --dev false \
  --entry-file index.js \
  --bundle-output /tmp/app.js --sourcemap-output /tmp/app.js.map
```
</details>

---

## What each command does

### `bundle` — what is taking up space

```bash
npx rn-profiler bundle /tmp/app.js
```

```
  bundle     2.24 MB
  attributed 2.03 MB across 15 packages
  unmapped   214.0 kB (9.5% — runtime, polyfills, module wrappers)

 Package                       Size   Share   Files
 react-native              612.0 kB   27.3%     449
 lucide-react-native       430.0 kB   19.2%    1633
 moment                    221.0 kB    9.8%       1
 [unmapped]                214.0 kB    9.5%       —
 [your code]               201.0 kB    9.0%      61
 react-native-svg          103.0 kB    4.6%     111
```

| Flag | What it does |
|---|---|
| `--top 40` | show more rows (default 20) |
| `--json` | machine-readable output, for `compare` or CI |
| `--html report.html` | write a shareable web page |
| `--map <path>` | point at the source map explicitly (found automatically otherwise) |

### `compare` — what did that change cost?

Save a baseline before you touch a dependency, then diff it:

```bash
npx rn-profiler bundle /tmp/before.js --json > before.json
npx rn-profiler bundle /tmp/after.js  --json > after.json
npx rn-profiler compare before.json after.json
```

```
 Package           Before    After     Change
 moment (gone)    68.0 kB        —   -68.0 kB
 date-fns (new)         —   7.4 kB    +7.4 kB

  Total  357.6 kB → 297.0 kB  -60.6 kB
```

### `renders` — what is redrawing for no reason

![Render report](https://raw.githubusercontent.com/Shrutis3004/rn-profiler/main/docs/render-report.png)

**Step 1.** Start the listener in a terminal:

```bash
npx rn-profiler renders --html render-report.html
```

**Step 2.** Wrap your app root. This is development-only — it does nothing in a production build:

```tsx
import { ProfilerRoot, Profile } from 'rn-profiler/runtime'

export default function App() {
  return (
    <ProfilerRoot app="MyApp">
      <Profile id="DashboardScreen">
        <DashboardScreen />
      </Profile>
    </ProfilerRoot>
  )
}
```

**Step 3.** Use your app for a minute, then press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal.

```
 Component          Mounts   Updates   Wasted     Total   Slowest
 TransactionRow          0        38    38/38    148 ms    3.9 ms
 ChartCard               0        24    20/24    134 ms    5.6 ms
 DashboardScreen         1        38        —    304 ms   34.1 ms

  TransactionRow re-rendered 38 times with no prop change — wrap it in
  React.memo, or memoise what the parent passes it.
```

> On a physical device, pass your laptop's LAN IP: `<ProfilerRoot host="192.168.1.42" />`

#### Getting the `Wasted` column

React's Profiler can tell you *that* a component re-rendered — it can never tell you *why*, because
it cannot see props. So instead of guessing, hand `useRenderTracker` the props you want watched. It
compares them against the previous render, so a re-render with nothing changed is **proven** wasted,
not estimated:

```tsx
function TransactionRow(props) {
  useRenderTracker('TransactionRow', props)
  return <View>{/* … */}</View>
}
```

Components without it still appear, with `—` in the Wasted column. An unmeasured component is never
reported as clean.

---

## How it works

**Size.** When Metro packages your app it also writes a *source map* — a file recording which
original source produced each part of the output. Its usual job is making stack traces readable.
`rn-profiler` walks it instead and adds up how many bytes trace back to each file, then rolls those
files up into the package that ships them.

A source map records where each piece of code *starts* but never how long it is, so the size is
derived: a mapping owns the bytes from its own column until the next mapping begins. Bytes that no
mapping claims are Metro's own runtime and are reported as `[unmapped]` rather than discarded — so
the totals always reconcile with the file on disk.

**Renders.** React's `<Profiler>` reports every commit, giving counts and timings for free.
`useRenderTracker` adds the missing half by shallow-comparing props with `Object.is`, the same
comparison `React.memo` uses. Events stream from the app to the CLI over a websocket, batched once a
second so the profiler does not become the performance problem it is looking for.

---

## Limitations

- **Needs the JavaScript bundle, not Hermes bytecode.** Expo now ships `.hbc` by default; use
  `expo export:embed` as shown above. The tool detects `.hbc` input and tells you.
- **A source map is required** — without one there is nothing to attribute bytes with.
- **Sizes are uncompressed.** Good for comparing packages against each other; not a download-size prediction.
- **`Wasted` only covers components using `useRenderTracker`.** Everything else shows `—`.
- **Prop comparison is shallow.** An object mutated in place keeps its identity and reads as
  unchanged — which is also how `React.memo` sees it.
- **The runtime adds overhead**, so do not read absolute timings from a profiled build.

Handled deliberately: nested `node_modules`, pnpm's virtual store, Windows paths, loader query
suffixes, and `webpack://` URLs all attribute correctly — see `test/packages.test.js`.

Web React works too (source maps are universal, `<Profiler>` is React core), but for web you are
probably better served by `source-map-explorer` or `webpack-bundle-analyzer`.

---

## Contributing

Bug reports with a reproduction are the most useful thing you can send. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

[MIT](./LICENSE)
