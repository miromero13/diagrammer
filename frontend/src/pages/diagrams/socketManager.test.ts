import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sockets, io } = vi.hoisted(() => ({ sockets: [] as any[], io: vi.fn() }))
vi.mock('socket.io-client', () => ({ io }))
vi.mock('@/lib/api', () => ({ api: { auth: { refresh: vi.fn() } }, authStorage: { accessTokenKey: 'access', refreshTokenKey: 'refresh' } }))

class FakeSocket {
  connected = false
  io = { on: vi.fn() }
  handlers = new Map<string, Array<(...args: any[]) => void>>()
  emitted: Array<[string, any]> = []
  on(event: string, handler: (...args: any[]) => void) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); return this }
  once(event: string, handler: (...args: any[]) => void) {
    const wrapped = (...args: any[]) => { this.off(event, wrapped); handler(...args) }
    return this.on(event, wrapped)
  }
  off(event: string, handler: (...args: any[]) => void) { this.handlers.set(event, (this.handlers.get(event) ?? []).filter((item) => item !== handler)); return this }
  emit(event: string, data?: any) { this.emitted.push([event, data]); return this }
  disconnect() { this.connected = false; return this }
  trigger(event: string, ...args: any[]) { for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args) }
}

import { socketManager } from './socketManager'

describe('socketManager reconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sockets.length = 0
    socketManager.disconnect()
    window.localStorage.setItem('access', 'token')
    io.mockImplementation(() => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    })
  })

  it('rejoins the active diagram after the transport reconnects', async () => {
    const connecting = socketManager.connect()
    const socket = sockets[0]
    socket.connected = true
    socket.trigger('connect')
    await connecting
    socketManager.joinDiagram('diagram-1')
    socket.emitted.length = 0

    socket.connected = false
    socket.trigger('disconnect', 'transport close')
    socket.connected = true
    socket.trigger('connect')

    expect(socket.emitted).toContainEqual(['diagram:join', 'diagram-1'])
    expect(socketManager.getConnectionStatus()).toMatchObject({ connected: true, currentDiagram: 'diagram-1' })
    socketManager.disconnect()
  })
})
