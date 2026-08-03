/**
 * Production-grade WebSocket service for real-time quiz synchronization.
 *
 * Features:
 * - Exponential backoff reconnection (up to 10 attempts)
 * - Connection state management
 * - Automatic ping/pong keepalive (15s interval)
 * - Message queuing during reconnection
 * - Clean disconnect handling
 */

// Determine WebSocket URL: use env var if set, otherwise derive from current browser location
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:8000`

export type WebSocketMessage = {
  type: string
  data?: any
}

export type MessageHandler = (message: WebSocketMessage) => void

export class QuizWebSocket {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelay = 500 // Start at 500ms
  private maxReconnectDelay = 10000 // Cap at 10s
  private url: string = ''
  private shouldReconnect = true
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private messageQueue: WebSocketMessage[] = []
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected'

  connect(url: string) {
    this.url = `${WS_URL}${url}`
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    this.createConnection()
  }

  private createConnection() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    // Clean up previous connection
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      try { this.ws.close() } catch {}
      this.ws = null
    }

    this.connectionState = 'connecting'
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.connectionState = 'connected'
      this.reconnectAttempts = 0
      this.startPing()
      this.notifyHandlers({ type: 'ws_connected' })

      // Flush queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!
        this.send(msg)
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        // Don't forward pong messages to handlers (internal keepalive)
        if (message.type === 'pong') return
        this.notifyHandlers(message)
      } catch (e) {
        // Silently ignore malformed messages
      }
    }

    this.ws.onclose = (event) => {
      this.connectionState = 'disconnected'
      this.stopPing()
      this.notifyHandlers({ type: 'ws_disconnected', data: { code: event.code } })

      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        // Exponential backoff with jitter
        const delay = Math.min(
          this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 200,
          this.maxReconnectDelay
        )
        setTimeout(() => {
          if (this.shouldReconnect) {
            this.createConnection()
          }
        }, delay)
      }
    }

    this.ws.onerror = () => {
      // Error is always followed by close event, no need to handle separately
    }
  }

  private startPing() {
    this.stopPing()
    // Ping every 15 seconds to keep connection alive and detect dead connections early
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 15000)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else if (this.connectionState === 'connecting') {
      // Queue messages while reconnecting (only important ones)
      if (message.type === 'submit_answer') {
        this.messageQueue.push(message)
      }
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private notifyHandlers(message: WebSocketMessage) {
    this.handlers.forEach((handler) => {
      try {
        handler(message)
      } catch (e) {
        // Don't let one handler crash others
      }
    })
  }

  disconnect() {
    this.shouldReconnect = false
    this.stopPing()
    this.messageQueue = []
    if (this.ws) {
      this.ws.onclose = null // Prevent reconnect on intentional close
      this.ws.close()
      this.ws = null
    }
    this.handlers.clear()
    this.connectionState = 'disconnected'
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get state() {
    return this.connectionState
  }
}
