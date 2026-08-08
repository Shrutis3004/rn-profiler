import {
  DEFAULT_PORT,
  type PropsEvent,
  type ProfilerMessage,
  type RenderEvent,
} from '../shared/events.js'

/**
 * Batching websocket client for the in-app side.
 *
 * Render callbacks fire on every commit, so sending each one immediately would
 * add exactly the kind of work this tool exists to find. Events are buffered and
 * flushed on an interval instead, and dropped entirely if nothing is listening —
 * a profiler that crashes the app when the CLI is closed is worse than useless.
 */

const FLUSH_INTERVAL_MS = 1000
const MAX_BUFFERED = 2000

let socket: WebSocket | undefined
let timer: ReturnType<typeof setInterval> | undefined
let renderBuffer: RenderEvent[] = []
let propsBuffer: PropsEvent[] = []
let warned = false

function send(message: ProfilerMessage): void {
  if (!socket || socket.readyState !== 1 /* OPEN */) return
  try {
    socket.send(JSON.stringify(message))
  } catch {
    // A failed send must never surface in the host app.
  }
}

function flush(): void {
  if (renderBuffer.length > 0) {
    send({ type: 'renders', events: renderBuffer })
    renderBuffer = []
  }
  if (propsBuffer.length > 0) {
    send({ type: 'props', events: propsBuffer })
    propsBuffer = []
  }
}

export function connect(options: { host?: string; port?: number; app?: string } = {}): void {
  if (socket) return

  const host = options.host ?? 'localhost'
  const port = options.port ?? DEFAULT_PORT

  const Ctor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
  if (!Ctor) {
    if (!warned) {
      console.warn('[rn-profiler] No WebSocket available in this environment; not reporting.')
      warned = true
    }
    return
  }

  try {
    socket = new Ctor(`ws://${host}:${port}`)
  } catch {
    return
  }

  socket.onopen = () => {
    send({ type: 'hello', app: options.app })
  }

  socket.onerror = () => {
    if (!warned) {
      console.warn(
        `[rn-profiler] Nothing listening on ${host}:${port}. Start it with: npx rn-profiler renders`,
      )
      warned = true
    }
  }

  socket.onclose = () => {
    socket = undefined
    renderBuffer = []
    propsBuffer = []
  }

  timer ??= setInterval(flush, FLUSH_INTERVAL_MS)
}

export function disconnect(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
  flush()
  socket?.close()
  socket = undefined
}

export function recordRender(event: RenderEvent): void {
  if (renderBuffer.length >= MAX_BUFFERED) return
  renderBuffer.push(event)
}

export function recordProps(event: PropsEvent): void {
  if (propsBuffer.length >= MAX_BUFFERED) return
  propsBuffer.push(event)
}
