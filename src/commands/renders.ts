import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import pc from 'picocolors'
import { WebSocketServer } from 'ws'
import { DEFAULT_PORT, isProfilerMessage } from '../shared/events.js'
import { RenderAggregator, renderHints, renderRenderTable } from '../lib/renderReport.js'
import { rendersHtml } from '../lib/htmlRenders.js'

interface RendersOptions {
  port: string
  json?: string
  html?: string
}

export function registerRendersCommand(program: Command): void {
  program
    .command('renders')
    .description('Listen for React render events from a running app and report the hotspots')
    .option('-p, --port <number>', 'port the in-app reporter connects to', String(DEFAULT_PORT))
    .option('--json <path>', 'also write the report to a JSON file on exit')
    .option('--html <path>', 'also write a self-contained HTML report on exit')
    .action(async (options: RendersOptions) => {
      const port = Number.parseInt(options.port, 10)
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`--port expects a number between 1 and 65535, got "${options.port}"`)
      }

      const aggregator = new RenderAggregator()
      const server = new WebSocketServer({ port })

      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve)
        server.once('error', (error: NodeJS.ErrnoException) => {
          reject(
            error.code === 'EADDRINUSE'
              ? new Error(`Port ${port} is already in use. Pick another with --port.`)
              : error,
          )
        })
      })

      console.log()
      console.log(`  ${pc.bold('rn-profiler')} listening on ${pc.cyan(`ws://localhost:${port}`)}`)
      console.log(pc.dim('  Wrap your app in <ProfilerRoot> from rn-profiler/runtime, then use the app.'))
      console.log(pc.dim('  Press Ctrl-C when you are done to see the report.'))
      console.log()

      let connected = 0
      let appName: string | undefined

      server.on('connection', (socket) => {
        connected += 1
        process.stdout.write(`\r  ${pc.green('●')} app connected${' '.repeat(30)}\n`)

        socket.on('message', (raw) => {
          let parsed: unknown
          try {
            parsed = JSON.parse(raw.toString())
          } catch {
            return
          }
          if (!isProfilerMessage(parsed)) return

          if (parsed.type === 'renders') aggregator.addRenders(parsed.events)
          else if (parsed.type === 'props') aggregator.addProps(parsed.events)
          else if (parsed.type === 'hello' && parsed.app) {
            appName = parsed.app
            console.log(pc.dim(`  app: ${parsed.app}`))
          }

          process.stdout.write(`\r  ${pc.dim(`${aggregator.totalCommits} commits recorded`)}   `)
        })

        socket.on('close', () => {
          connected -= 1
          process.stdout.write(`\r  ${pc.yellow('○')} app disconnected${' '.repeat(30)}\n`)
        })
      })

      const report = async (): Promise<void> => {
        process.stdout.write('\r' + ' '.repeat(60) + '\r')
        console.log()

        if (aggregator.isEmpty) {
          console.log(pc.yellow('  No render events received.'))
          console.log(
            pc.dim(
              connected === 0
                ? '  The app never connected — check the host and port, and use your LAN IP on a device.'
                : '  The app connected but sent nothing — is <ProfilerRoot> actually mounted?',
            ),
          )
          console.log()
          return
        }

        const rows = aggregator.ranked()
        console.log(renderRenderTable(rows))
        console.log()

        for (const hint of renderHints(rows)) {
          console.log(`  ${hint}`)
        }
        if (renderHints(rows).length > 0) console.log()

        if (options.json) {
          const target = resolve(options.json)
          await writeFile(target, JSON.stringify({ app: appName, components: rows }, null, 2))
          console.log(`  ${pc.green('✓')} JSON written to ${target}`)
        }

        if (options.html) {
          const target = resolve(options.html)
          await writeFile(target, rendersHtml(rows, appName))
          console.log(`  ${pc.green('✓')} report written to ${target}`)
        }

        if (options.json || options.html) console.log()
      }

      const shutdown = (): void => {
        void report().then(() => {
          server.close()
          process.exit(0)
        })
      }

      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })
}
