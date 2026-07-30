const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export type WebSocketMessage = {
  type: string
  data?: any
}

export type MessageHandler = (message: WebSocketMessage) => void

export class QuizWebSocket {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private url: string = ''
  private shouldReconnect = true
  private pingInterval: ReturnType<typeof setInterval> | null = null

  connect(url: string) {
    this.url = `${WS_URL}${url}`
    this.shouldReconnect = true
    this.createConnection()
  }

  private createConnection() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startPing()
      this.notifyHandlers({ type: 'ws_connected' })
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.notifyHandlers(message)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    this.ws.onclose = (event) => {
      this.stopPing()
      this.notifyHandlers({ type: 'ws_disconnected', data: { code: event.code } })

      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
        setTimeout(() => this.createConnection(), delay)
      }
    }

    this.ws.onerror = () => {
      this.notifyHandlers({ type: 'ws_error' })
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' })
    }, 30000)
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
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private notifyHandlers(message: WebSocketMessage) {
    this.handlers.forEach((handler) => handler(message))
  }

  disconnect() {
    this.shouldReconnect = false
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.handlers.clear()
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
