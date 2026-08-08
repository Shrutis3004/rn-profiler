import { Command } from 'commander'
import { registerBundleCommand } from './commands/bundle.js'
import { registerCompareCommand } from './commands/compare.js'
import { registerRendersCommand } from './commands/renders.js'

/** Replaced at build time with the version from package.json (see tsup.config.ts). */
declare const __VERSION__: string

const program = new Command()

program
  .name('rn-profiler')
  .description('Find what is bloating your React Native bundle and which components re-render for no reason.')
  .version(__VERSION__)

registerBundleCommand(program)
registerCompareCommand(program)
registerRendersCommand(program)

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
