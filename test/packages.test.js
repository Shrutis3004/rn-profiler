import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { SourceMapGenerator } from 'source-map'

const run = promisify(execFile)
const CLI = new URL('../dist/index.js', import.meta.url).pathname

/**
 * Every path shape Metro has been seen to emit. Each entry is
 * [source path, the package it must be attributed to].
 */
const PATHS = [
  ['/proj/node_modules/lodash/index.js', 'lodash'],
  ['node_modules/react-native/Libraries/Text/Text.js', 'react-native'],
  ['/proj/node_modules/@babel/runtime/helpers/extends.js', '@babel/runtime'],
  ['/proj/src/App.tsx', '[your code]'],
  // Nested dependency: belongs to the inner package, not the outer one.
  ['/proj/node_modules/a/node_modules/b/index.js', 'b'],
  // Windows separators.
  ['C:\\proj\\node_modules\\lodash\\fp.js', 'lodash'],
  // Loader query and fragment suffixes.
  ['/proj/node_modules/expo/build/Expo.js?platform=ios', 'expo'],
  ['/proj/src/Home.tsx#inline', '[your code]'],
  // Bundler URL schemes.
  ['webpack:///./src/index.js', '[your code]'],
  ['file:///proj/node_modules/zustand/index.js', 'zustand'],
  // pnpm virtual store.
  ['/proj/node_modules/.pnpm/react-native@0.74.1/node_modules/react-native/index.js', 'react-native'],
  [
    '/proj/node_modules/.pnpm/@react-navigation+native@6.1.0/node_modules/@react-navigation/native/index.js',
    '@react-navigation/native',
  ],
]

async function attribute(sources) {
  const dir = await mkdtemp(join(tmpdir(), 'rn-profiler-pkg-'))
  const lines = sources.map(() => 'X'.repeat(100))
  const generator = new SourceMapGenerator({ file: 'bundle.js' })

  sources.forEach((source, index) => {
    generator.addMapping({
      generated: { line: index + 1, column: 0 },
      original: { line: 1, column: 0 },
      source,
    })
  })

  const bundlePath = join(dir, 'bundle.js')
  await writeFile(bundlePath, lines.join('\n'))
  await writeFile(`${bundlePath}.map`, generator.toString())

  const { stdout } = await run('node', [CLI, 'bundle', bundlePath, '--json'])
  return { dir, bundlePath, report: JSON.parse(stdout) }
}

test('attributes every path shape Metro emits to the right package', async () => {
  const { report } = await attribute(PATHS.map(([source]) => source))
  const names = new Set(report.packages.map((entry) => entry.name))

  for (const [source, expected] of PATHS) {
    assert.ok(names.has(expected), `${source} should attribute to ${expected}`)
  }
})

test('writes a self-contained HTML report', async () => {
  const { dir, bundlePath } = await attribute(PATHS.map(([source]) => source))
  const htmlPath = join(dir, 'report.html')

  await run('node', [CLI, 'bundle', bundlePath, '--html', htmlPath])
  const html = await readFile(htmlPath, 'utf8')

  assert.match(html, /<!doctype html>/i)
  assert.match(html, /Bundle report/)
  assert.match(html, /react-native/)
  assert.match(html, /prefers-color-scheme: dark/, 'must style both themes')

  // Self-contained means no request can leave the page.
  assert.doesNotMatch(html, /<script/i, 'no scripts')
  assert.doesNotMatch(html, /https?:\/\//i, 'no external URLs')
  assert.doesNotMatch(html, /<link/i, 'no external stylesheets')
})

test('escapes the bundle path rather than injecting it into the page', async () => {
  // The path comes straight off argv and is printed in the report header, so it
  // is the one string in the page that arrives unsanitised. (Package names cannot
  // carry markup: source-map percent-encodes its sources on the way back out.)
  const dir = await mkdtemp(join(tmpdir(), 'rn-profiler-esc-'))
  const bundlePath = join(dir, '<img src=x onerror=alert(1)>.js')

  const generator = new SourceMapGenerator({ file: 'bundle.js' })
  generator.addMapping({
    generated: { line: 1, column: 0 },
    original: { line: 1, column: 0 },
    source: '/proj/node_modules/lodash/index.js',
  })
  await writeFile(bundlePath, 'X'.repeat(100))
  await writeFile(`${bundlePath}.map`, generator.toString())

  const htmlPath = join(dir, 'escaped.html')
  await run('node', [CLI, 'bundle', bundlePath, '--html', htmlPath])
  const html = await readFile(htmlPath, 'utf8')

  assert.doesNotMatch(html, /<img src=x/, 'raw markup must not reach the page')
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, 'it should appear escaped instead')
})

test('rejects a Hermes bytecode bundle with a useful message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rn-profiler-hbc-'))
  const bundlePath = join(dir, 'index.js')

  // The literal first eight bytes of a real Hermes bundle, taken from an actual
  // `expo export` output. Written as a byte sequence on purpose: an earlier
  // version of this test encoded the magic with writeUInt32LE and the code read
  // it back the same wrong way round, so the test agreed with the bug and a real
  // .hbc file sailed straight through the check.
  const header = Buffer.alloc(64)
  Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]).copy(header)
  await writeFile(bundlePath, header)
  await writeFile(`${bundlePath}.map`, JSON.stringify({ version: 3, sources: [], mappings: '' }))

  await assert.rejects(
    () => run('node', [CLI, 'bundle', bundlePath]),
    (error) => /Hermes bytecode/.test(error.stderr),
  )
})
