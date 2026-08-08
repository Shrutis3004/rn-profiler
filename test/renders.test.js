import assert from 'node:assert/strict'
import test from 'node:test'
import { WebSocket, WebSocketServer } from 'ws'
import * as React from 'react'
import TestRenderer from 'react-test-renderer'

// The runtime targets React Native, which supplies a global WebSocket. Node 20
// does not, so stand ws in for it before importing the runtime.
globalThis.WebSocket = WebSocket
globalThis.__DEV__ = true

const { ProfilerRoot, Profile, useRenderTracker } = await import('../dist/runtime.js')

/** Start a listener that records every message the app sends it. */
async function listen() {
  const server = new WebSocketServer({ port: 0 })
  const messages = []

  await new Promise((resolve) => server.once('listening', resolve))

  server.on('connection', (socket) => {
    socket.on('message', (raw) => {
      messages.push(JSON.parse(raw.toString()))
    })
  })

  return {
    port: server.address().port,
    messages,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

test('reports renders and provably wasted re-renders from a real React tree', async (t) => {
  const listener = await listen()
  t.after(() => listener.close())

  let setCount

  // Row never uses `count`, but the parent hands it a freshly built object on
  // every render — the classic wasted re-render this tool exists to surface.
  function Row(props) {
    useRenderTracker('Row', props)
    return null
  }

  function Screen() {
    const [count, setCount] = React.useState(0)
    setCountRef.current = setCount
    return React.createElement(
      Profile,
      { id: 'Screen' },
      React.createElement(Row, { style: { padding: 8 }, label: 'static' }),
      React.createElement('div', null, count),
    )
  }

  const setCountRef = { current: null }

  let renderer
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        ProfilerRoot,
        { host: 'localhost', port: listener.port, app: 'test-app' },
        React.createElement(Screen),
      ),
    )
  })

  await settle()

  // Three state updates: Row re-renders each time with a brand new style object.
  for (let i = 0; i < 3; i += 1) {
    await TestRenderer.act(async () => {
      setCountRef.current(i + 1)
    })
  }

  // Unmounting disconnects, which flushes the buffer immediately.
  await TestRenderer.act(async () => {
    renderer.unmount()
  })
  await settle()

  const hello = listener.messages.find((message) => message.type === 'hello')
  assert.equal(hello?.app, 'test-app', 'app should announce itself on connect')

  const renderEvents = listener.messages
    .filter((message) => message.type === 'renders')
    .flatMap((message) => message.events)

  assert.ok(renderEvents.length > 0, 'should report render events')

  const ids = new Set(renderEvents.map((event) => event.id))
  assert.ok(ids.has('app'), 'ProfilerRoot should report under "app"')
  assert.ok(ids.has('Screen'), 'Profile should report under its own id')

  const mounts = renderEvents.filter((event) => event.phase === 'mount')
  const updates = renderEvents.filter((event) => event.phase === 'update')
  assert.ok(mounts.length > 0, 'should record the initial mount')
  assert.equal(updates.filter((event) => event.id === 'Screen').length, 3)

  const propEvents = listener.messages
    .filter((message) => message.type === 'props')
    .flatMap((message) => message.events)

  assert.equal(propEvents.length, 3, 'Row re-rendered three times')
  // `style` is a new object literal each render, so Object.is sees a change every time.
  assert.ok(
    propEvents.every((event) => event.changed.includes('style')),
    'the recreated style object should be reported as the changed prop',
  )
})

test('a memo-stable component reports zero wasted renders', async (t) => {
  const listener = await listen()
  t.after(() => listener.close())

  const STABLE_STYLE = { padding: 8 }
  const setCountRef = { current: null }

  function Row(props) {
    useRenderTracker('StableRow', props)
    return null
  }

  function Screen() {
    const [count, setCount] = React.useState(0)
    setCountRef.current = setCount
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Row, { style: STABLE_STYLE, label: 'static' }),
      React.createElement('div', null, count),
    )
  }

  let renderer
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        ProfilerRoot,
        { host: 'localhost', port: listener.port },
        React.createElement(Screen),
      ),
    )
  })
  await settle()

  await TestRenderer.act(async () => setCountRef.current(1))
  await TestRenderer.act(async () => setCountRef.current(2))

  await TestRenderer.act(async () => renderer.unmount())
  await settle()

  const propEvents = listener.messages
    .filter((message) => message.type === 'props')
    .flatMap((message) => message.events)

  assert.equal(propEvents.length, 2)
  assert.ok(
    propEvents.every((event) => event.changed.length === 0),
    'identical props must be reported as a wasted render',
  )
})

test('the app does not crash when nothing is listening', async () => {
  const setCountRef = { current: null }

  function Screen() {
    const [count, setCount] = React.useState(0)
    setCountRef.current = setCount
    return React.createElement('div', null, count)
  }

  let renderer
  await TestRenderer.act(async () => {
    // Port 1 is privileged and will refuse the connection.
    renderer = TestRenderer.create(
      React.createElement(
        ProfilerRoot,
        { host: 'localhost', port: 1 },
        React.createElement(Screen),
      ),
    )
  })

  await TestRenderer.act(async () => setCountRef.current(1))
  await settle()

  assert.equal(renderer.toJSON().children[0], '1', 'app keeps rendering with no listener')

  await TestRenderer.act(async () => renderer.unmount())
})
