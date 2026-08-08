import * as React from 'react'
import { connect, disconnect, recordProps, recordRender } from './transport.js'
import type { RenderPhase } from '../shared/events.js'

export interface ProfilerRootProps {
  children: React.ReactNode
  /** Machine running the CLI. Use your LAN IP for a physical device. */
  host?: string
  port?: number
  /** Label shown in the CLI, useful when profiling more than one app. */
  app?: string
  /** Escape hatch; defaults to development builds only. */
  enabled?: boolean
}

const isDev = (): boolean => {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__
  return dev !== false
}

function onRender(
  id: string,
  phase: RenderPhase,
  actualDuration: number,
  baseDuration: number,
): void {
  recordRender({ id, phase, actualDuration, baseDuration })
}

/**
 * Wrap your app root. Opens the connection to the CLI and profiles everything
 * beneath it as a single tree.
 */
export function ProfilerRoot({
  children,
  host,
  port,
  app,
  enabled,
}: ProfilerRootProps): React.ReactElement {
  const active = enabled ?? isDev()

  React.useEffect(() => {
    if (!active) return
    connect({ host, port, app })
    return () => disconnect()
  }, [active, host, port, app])

  if (!active) return <>{children}</>

  return (
    <React.Profiler id="app" onRender={onRender}>
      {children}
    </React.Profiler>
  )
}

export interface ProfileProps {
  id: string
  children: React.ReactNode
}

/**
 * Wrap any subtree you want reported separately — a screen, a list, a heavy card.
 * Nest as many as you like; React reports each one independently.
 */
export function Profile({ id, children }: ProfileProps): React.ReactElement {
  if (!isDev()) return <>{children}</>
  return (
    <React.Profiler id={id} onRender={onRender}>
      {children}
    </React.Profiler>
  )
}

/**
 * Report which props changed on each re-render of a component.
 *
 * React's Profiler can tell you that something re-rendered, never *why*. This
 * shallow-compares the props you hand it between renders, so a render with no
 * changed props is a provably wasted one rather than a guess.
 *
 *   function Row(props) {
 *     useRenderTracker('Row', props)
 *     ...
 *   }
 */
export function useRenderTracker(id: string, props: Record<string, unknown>): void {
  const previous = React.useRef<Record<string, unknown> | undefined>(undefined)

  React.useEffect(() => {
    const before = previous.current
    previous.current = props

    if (!before || !isDev()) return

    const keys = new Set([...Object.keys(before), ...Object.keys(props)])
    const changed: string[] = []
    for (const key of keys) {
      if (!Object.is(before[key], props[key])) changed.push(key)
    }

    recordProps({ id, changed })
  })
}

export { connect, disconnect }
