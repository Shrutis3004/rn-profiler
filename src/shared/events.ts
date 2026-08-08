/** Wire format shared by the in-app runtime and the CLI listener. */

export const DEFAULT_PORT = 8899

export type RenderPhase = 'mount' | 'update' | 'nested-update'

/** One commit, as reported by React's Profiler. */
export interface RenderEvent {
  id: string
  phase: RenderPhase
  /** Time spent rendering this subtree for this commit, in ms. */
  actualDuration: number
  /** Estimated cost with no memoisation, in ms. */
  baseDuration: number
}

/**
 * One re-render of a tracked component, with the props that actually changed.
 * An empty `changed` array means the component re-rendered for nothing.
 */
export interface PropsEvent {
  id: string
  changed: string[]
}

export type ProfilerMessage =
  | { type: 'hello'; app?: string }
  | { type: 'renders'; events: RenderEvent[] }
  | { type: 'props'; events: PropsEvent[] }

export function isProfilerMessage(value: unknown): value is ProfilerMessage {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return type === 'hello' || type === 'renders' || type === 'props'
}
