import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// Single source of truth: a hardcoded version string in the CLI silently goes
// stale the first time package.json is bumped, and nothing catches it.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
    define: { __VERSION__: JSON.stringify(version) },
  },
  {
    // Runs inside the user's React Native app, so React stays external and the
    // output keeps both module formats Metro might ask for.
    entry: { runtime: 'src/runtime/index.tsx' },
    format: ['esm', 'cjs'],
    target: 'es2020',
    dts: true,
    external: ['react'],
  },
])
