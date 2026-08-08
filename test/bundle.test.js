import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceMapGenerator } from 'source-map'

const run = promisify(execFile)
const CLI = new URL('../dist/index.js', import.meta.url).pathname

/**
 * Build a bundle whose byte layout is known exactly, so the attribution can be
 * asserted against real numbers instead of eyeballed.
 *
 * Three lines, one mapping each at column 0, so every line's bytes belong to a
 * single source. Lines 1 and 2 carry a trailing newline; the last one does not.
 */
async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'rn-profiler-'))

  const lines = [
    'L'.repeat(100), // lodash      -> 100 + newline = 101
    'M'.repeat(200), // moment      -> 200 + newline = 201
    'A'.repeat(50), //  app code    ->  50 (no trailing newline)
  ]
  const bundle = lines.join('\n')

  const generator = new SourceMapGenerator({ file: 'bundle.js' })
  const sources = [
    '/proj/node_modules/lodash/index.js',
    '/proj/node_modules/moment/moment.js',
    '/proj/src/App.tsx',
  ]
  sources.forEach((source, index) => {
    generator.addMapping({
      generated: { line: index + 1, column: 0 },
      original: { line: 1, column: 0 },
      source,
    })
  })

  const bundlePath = join(dir, 'bundle.js')
  await writeFile(bundlePath, bundle)
  await writeFile(`${bundlePath}.map`, generator.toString())
  return { dir, bundlePath, totalBytes: bundle.length }
}

async function analyse(bundlePath) {
  const { stdout } = await run('node', [CLI, 'bundle', bundlePath, '--json'])
  return JSON.parse(stdout)
}

function bytesFor(report, name) {
  return report.packages.find((entry) => entry.name === name)?.bytes ?? 0
}

test('attributes each line of the bundle to the package that produced it', async () => {
  const { bundlePath } = await makeFixture()
  const report = await analyse(bundlePath)

  assert.equal(bytesFor(report, 'lodash'), 101)
  assert.equal(bytesFor(report, 'moment'), 201)
  assert.equal(bytesFor(report, '[your code]'), 50)
})

test('every byte on disk is accounted for exactly once', async () => {
  const { bundlePath, totalBytes } = await makeFixture()
  const report = await analyse(bundlePath)

  const summed = report.packages.reduce((total, entry) => total + entry.bytes, 0)
  assert.equal(summed, totalBytes, 'sum of package sizes must equal the file size')
  assert.equal(report.totalBytes, report.bundleBytes)
})

test('ranks packages largest first', async () => {
  const { bundlePath } = await makeFixture()
  const report = await analyse(bundlePath)

  const sizes = report.packages.map((entry) => entry.bytes)
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a))
  assert.equal(report.packages[0].name, 'moment')
})

test('compare reports the delta between two snapshots', async () => {
  const { dir, bundlePath } = await makeFixture()

  const before = join(dir, 'before.json')
  const after = join(dir, 'after.json')

  const { stdout: baseline } = await run('node', [CLI, 'bundle', bundlePath, '--json'])
  await writeFile(before, baseline)

  // Same report, but with moment removed — as if the dependency had been dropped.
  const shrunk = JSON.parse(baseline)
  shrunk.packages = shrunk.packages.filter((entry) => entry.name !== 'moment')
  shrunk.totalBytes -= 201
  await writeFile(after, JSON.stringify(shrunk))

  const { stdout } = await run('node', [CLI, 'compare', before, after])
  assert.match(stdout, /moment/)
  assert.match(stdout, /gone/)
  assert.match(stdout, /-201 B/)
})

test('rejects a bundle with no source map beside it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rn-profiler-'))
  const orphan = join(dir, 'orphan.js')
  await writeFile(orphan, 'var x = 1;')

  await assert.rejects(
    () => run('node', [CLI, 'bundle', orphan]),
    (error) => /No source map found/.test(error.stderr),
  )
})
