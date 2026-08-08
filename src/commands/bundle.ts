import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import pc from 'picocolors'
import { isHermesBytecode, readSourceMap, resolveInputs } from '../lib/inputs.js'
import { attributeBundle } from '../lib/attribute.js'
import { renderSummary, renderTable } from '../lib/report.js'
import { bundleHtml } from '../lib/htmlBundle.js'

interface BundleOptions {
  map?: string
  json?: boolean
  html?: string
  top: string
}

export function registerBundleCommand(program: Command): void {
  program
    .command('bundle')
    .description('Report which npm packages are taking up space in a React Native bundle')
    .argument('<bundle>', 'path to the .js bundle produced by Metro or Expo')
    .option('-m, --map <path>', 'path to the source map (defaults to <bundle>.map)')
    .option('-t, --top <number>', 'how many packages to list', '20')
    .option('--json', 'emit machine-readable JSON, suitable for `rn-profiler compare`')
    .option('--html <path>', 'write a self-contained HTML report')
    .action(async (bundleArg: string, options: BundleOptions) => {
      const inputs = await resolveInputs(bundleArg, options.map)

      if (await isHermesBytecode(inputs.bundlePath)) {
        throw new Error(
          'That bundle is Hermes bytecode, not JavaScript.\n' +
            'Point rn-profiler at the pre-Hermes .js bundle instead.',
        )
      }

      const [bundleSource, map] = await Promise.all([
        readFile(inputs.bundlePath, 'utf8'),
        readSourceMap(inputs.mapPath),
      ])

      const attribution = await attributeBundle(bundleSource, map)

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              bundle: inputs.bundlePath,
              bundleBytes: inputs.bundleBytes,
              totalBytes: attribution.totalBytes,
              mappedBytes: attribution.mappedBytes,
              packages: attribution.packages,
            },
            null,
            2,
          ),
        )
        return
      }

      const top = Number.parseInt(options.top, 10)
      if (!Number.isFinite(top) || top < 1) {
        throw new Error(`--top expects a positive number, got "${options.top}"`)
      }

      console.log()
      console.log(renderSummary(attribution, inputs.bundleBytes))
      console.log()
      console.log(renderTable(attribution, { top }))
      console.log()

      if (options.html) {
        const target = resolve(options.html)
        await writeFile(target, bundleHtml(attribution, inputs.bundlePath, inputs.bundleBytes))
        console.log(`  ${pc.green('✓')} report written to ${target}`)
      } else {
        console.log(
          pc.dim('  Save a baseline with --json, then: rn-profiler compare before.json after.json'),
        )
      }
      console.log()
    })
}
