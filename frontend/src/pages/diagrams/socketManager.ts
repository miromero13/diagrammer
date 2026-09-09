import { io, type Socket } from 'socket.io-client'

import { AppConfig } from '@/config/app.config'
import { api, authStorage } from '@/lib/api'

type SocketEvent =
  | 'socketConnected'
  | 'socketDisconnected'
  | 'socketReconnected'
  | 'socketReconnectError'
  | 'socketReconnectFailed'
  | 'socketError'
  | 'userJoined'
  | 'userLeft'
  | 'usersUpdated'
  | 'elementAdded'
  | 'elementUpdated'
  | 'elementDeleted'
  | 'elementLocked'
  | 'elementUnlocked'
  | 'elementLockSuccess'
  | 'elementLockFailed'
  | 'lockedElements'
  | 'selectedElements'
  | 'cursorMoved'
  | 'elementAddedConfirm'
  | 'elementUpdatedConfirm'
  | 'elementDeletedConfirm'
  | 'elementSelectConfirm'
  | 'elementSelected'
  | 'elementDeselected'
  | 'serverError'

type Listener = (data?: any) => void

class SocketManager {
  socket: Socket | null = null
  isConnected = false
  currentDiagramId: string | null = null
  connectedUsers: Array<Record<string, unknown>> = []
  eventListeners: Partial<Record<SocketEvent, Listener[]>> = {}
  reconnectAttempts = 0
  maxReconnectAttempts = AppConfig.SOCKET_RECONNECT_ATTEMPTS
  reconnectDelay = AppConfig.SOCKET_RECONNECT_DELAY
  pingInterval: number | null = null
  cursorThrottle = false

  async connect() {
    try {
      const token = window.localStorage.getItem(authStorage.accessTokenKey)
      if (!token) return false

      this.socket = io(AppConfig.SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: false,
      })

      this.setupEventHandlers()

      return await new Promise<boolean>((resolve) => {
        this.socket?.once('connect', () => {
          this.isConnected = true
          this.reconnectAttempts = 0
          this.startPingInterval()
          this.emit('socketConnected')
          resolve(true)
        })

        this.socket?.once('connect_error', async (error: Error) => {
          this.isConnected = false
          this.emit('socketError', error)

          if (error.message.includes('jwt expired') || error.message.includes('Token inválido')) {
            await this.handleTokenExpired()
          }

          resolve(false)
        })
      })
    } catch {
      return false
    }
  }

  setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false
      this.emit('socketDisconnected', reason)
      if (reason === 'io server disconnect') this.handleReconnection()
    })

    this.socket.on('reconnect', () => {
      this.isConnected = true
      this.reconnectAttempts = 0
      this.emit('socketReconnected')
      if (this.currentDiagramId) this.joinDiagram(this.currentDiagramId)
    })

    this.socket.on('reconnect_error', (error) => this.emit('socketReconnectError', error))
    this.socket.on('userJoined', (data) => this.emit('userJoined', data))
    this.socket.on('userLeft', (data) => this.emit('userLeft', data))
    this.socket.on('usersUpdated', (users) => {
      this.connectedUsers = users as Array<Record<string, unknown>>
      this.emit('usersUpdated', users)
    })
    this.socket.on('elementAdded', (data) => this.emit('elementAdded', data))
    this.socket.on('elementUpdated', (data) => this.emit('elementUpdated', data))
    this.socket.on('elementDeleted', (data) => this.emit('elementDeleted', data))
    this.socket.on('elementLocked', (data) => this.emit('elementLocked', data))
    this.socket.on('elementUnlocked', (data) => this.emit('elementUnlocked', data))
    this.socket.on('elementLockSuccess', (data) => this.emit('elementLockSuccess', data))
    this.socket.on('elementLockFailed', (data) => this.emit('elementLockFailed', data))
    this.socket.on('lockedElements', (elements) => this.emit('lockedElements', elements))
    this.socket.on('selectedElements', (elements) => this.emit('selectedElements', elements))
    this.socket.on('cursorMoved', (data) => this.emit('cursorMoved', data))
    this.socket.on('elementAddedConfirm', (data) => this.emit('elementAddedConfirm', data))
    this.socket.on('elementUpdatedConfirm', (data) => this.emit('elementUpdatedConfirm', data))
    this.socket.on('elementDeletedConfirm', (data) => this.emit('elementDeletedConfirm', data))
    this.socket.on('elementSelectConfirm', (data) => this.emit('elementSelectConfirm', data))
    this.socket.on('elementSelected', (data) => this.emit('elementSelected', data))
    this.socket.on('elementDeselected', (data) => this.emit('elementDeselected', data))
    this.socket.on('error', (error) => this.emit('serverError', error))
    this.socket.on('pong', () => undefined)
  }

  async handleTokenExpired() {
    try {
      const refreshToken = window.localStorage.getItem(authStorage.refreshTokenKey)
      if (!refreshToken) return
      const refreshed = await api.auth.refresh(refreshToken)
      window.localStorage.setItem(authStorage.accessTokenKey, refreshed.accessToken)
      window.localStorage.setItem(authStorage.refreshTokenKey, refreshed.refreshToken)
      await this.connect()
    } catch {
      this.disconnect()
    }
  }

  handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('socketReconnectFailed')
      return
    }

    const delay = this.reconnectDelay * (2 ** this.reconnectAttempts)
    window.setTimeout(() => {
      this.reconnectAttempts += 1
      void this.connect()
    }, delay)
  }

  joinDiagram(diagramId: string) {
    if (!this.isConnected || !this.socket) return
    if (this.currentDiagramId && this.currentDiagramId !== diagramId) this.leaveDiagram(this.currentDiagramId)
    this.currentDiagramId = diagramId
    this.socket.emit('diagram:join', diagramId)
  }

  leaveDiagram(diagramId: string | null = null) {
    if (!this.isConnected || !this.socket) return
    const targetDiagramId = diagramId ?? this.currentDiagramId
    if (!targetDiagramId) return
    this.socket.emit('diagram:leave', targetDiagramId)
    if (targetDiagramId === this.currentDiagramId) {
      this.currentDiagramId = null
      this.connectedUsers = []
    }
  }

  addElement(element: unknown) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('diagram:element:add', { diagramId: this.currentDiagramId, element })
  }

  updateElement(elementId: string, changes: unknown) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('diagram:element:update', { diagramId: this.currentDiagramId, elementId, changes })
  }

  deleteElement(elementId: string) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('diagram:element:delete', { diagramId: this.currentDiagramId, elementId })
  }

  lockElement(elementId: string) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('element:lock', { diagramId: this.currentDiagramId, elementId })
  }

  unlockElement(elementId: string) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('element:unlock', { diagramId: this.currentDiagramId, elementId })
  }

  selectElement(elementId: string) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('element:select', { diagramId: this.currentDiagramId, elementId })
  }

  deselectElement(elementId: string) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    this.socket.emit('element:deselect', { diagramId: this.currentDiagramId, elementId })
  }

  moveCursor(position: { x: number; y: number }) {
    if (!this.isConnected || !this.socket || !this.currentDiagramId) return
    if (this.cursorThrottle) return
    this.cursorThrottle = true
    this.socket.emit('cursor:move', { diagramId: this.currentDiagramId, position })
    window.setTimeout(() => {
      this.cursorThrottle = false
    }, 100)
  }

  disconnect() {
    if (!this.socket) return
    if (this.currentDiagramId) this.leaveDiagram()
    this.stopPingInterval()
    this.socket.disconnect()
    this.socket = null
    this.isConnected = false
    this.currentDiagramId = null
    this.connectedUsers = []
  }

  on(event: SocketEvent, callback: Listener) {
    this.eventListeners[event] ??= []
    this.eventListeners[event]?.push(callback)
  }

  off(event: SocketEvent, callback: Listener | null = null) {
    if (!this.eventListeners[event]) return
    if (callback) {
      this.eventListeners[event] = this.eventListeners[event]?.filter((cb) => cb !== callback)
    } else {
      delete this.eventListeners[event]
    }
  }

  emit(event: SocketEvent, data?: unknown) {
    this.eventListeners[event]?.forEach((callback) => {
      try {
        callback(data)
      } catch {
        undefined
      }
    })
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      currentDiagram: this.currentDiagramId,
      connectedUsers: this.connectedUsers,
      reconnectAttempts: this.reconnectAttempts,
    }
  }

  isSocketConnected() {
    return this.isConnected && Boolean(this.socket?.connected)
  }

  ping() {
    if (this.isConnected && this.socket) this.socket.emit('ping')
  }

  startPingInterval() {
    this.stopPingInterval()
    this.pingInterval = window.setInterval(() => this.ping(), 30000)
  }

  stopPingInterval() {
    if (!this.pingInterval) return
    window.clearInterval(this.pingInterval)
    this.pingInterval = null
  }
}

export const socketManager = new SocketManager()
