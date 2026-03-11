import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, afterAll, beforeAll } from 'vitest'
import { server } from './mocks/server'

// Polyfill localStorage for jsdom environments that lack it
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.clear) {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true })
}

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  try { localStorage.clear() } catch { /* ignore */ }
})
afterAll(() => server.close())

// Stub window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Stub createObjectURL / revokeObjectURL
URL.createObjectURL = () => 'blob:test'
URL.revokeObjectURL = () => {}

// Stub AudioContext for RacePage sound effects
class MockOscillator {
  type = 'sine'
  frequency = { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }
  connect() { return this }
  start() {}
  stop() {}
  disconnect() {}
}

class MockGainNode {
  gain = { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }
  connect() { return this }
  disconnect() {}
}

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: class {
    currentTime = 0
    destination = {}
    createOscillator() { return new MockOscillator() }
    createGain() { return new MockGainNode() }
    close() { return Promise.resolve() }
  },
})
