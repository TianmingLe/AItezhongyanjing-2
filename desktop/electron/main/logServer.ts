import * as crypto from 'node:crypto'
import * as http from 'node:http'

import { WebSocketServer, type WebSocket } from 'ws'

import type { EventEnvelope, InitEvent, LogEvent, StatusEvent } from '../shared/protocol'

export type LogServerHandle = {
  wsUrl: string
  token: string
  broadcast: (event: LogEvent | StatusEvent) => void
  close: () => Promise<void>
}

type Client = {
  ws: WebSocket
  alive: boolean
}

const parseToken = (url: string | undefined): string | null => {
  if (!url) return null
  try {
    const u = new URL(url, 'http://127.0.0.1')
    return u.searchParams.get('token')
  } catch {
    return null
  }
}

const safeSend = (ws: WebSocket, payload: unknown): boolean => {
  try {
    ws.send(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export const startLogServer = async (opts?: { backlogMax?: number }): Promise<LogServerHandle> => {
  const backlogMax = Math.max(1, opts?.backlogMax ?? 1000)
  const token = crypto.randomBytes(24).toString('hex')
  const clients = new Set<Client>()
  const backlog: EventEnvelope[] = []

  // Local-only WS server:
  // - binds 127.0.0.1 with port 0 (dynamic)
  // - requires `?token=...` for each connection
  const server = http.createServer()
  const wss = new WebSocketServer({ noServer: true })

  const pushBacklog = (ev: EventEnvelope) => {
    backlog.push(ev)
    if (backlog.length > backlogMax) backlog.splice(0, backlog.length - backlogMax)
  }

  const removeClient = (c: Client) => {
    clients.delete(c)
    try {
      c.ws.terminate()
    } catch {
      // ignore
    }
  }

  wss.on('connection', (ws: WebSocket) => {
    const c: Client = { ws, alive: true }
    clients.add(c)

    ws.on('pong', () => {
      c.alive = true
    })
    ws.on('close', () => {
      clients.delete(c)
    })
    ws.on('error', () => {
      clients.delete(c)
    })

    // First message for new clients: send backlog for quick UI warm-up after reconnect.
    const init: InitEvent = { type: 'init', now: Date.now(), backlog: backlog.slice() }
    if (!safeSend(ws, init)) {
      removeClient(c)
    }
  })

  // Token auth happens before WS upgrade to avoid unauthenticated clients becoming active.
  server.on('upgrade', (req, socket, head) => {
    const incomingToken = parseToken(req.url)
    if (incomingToken !== token) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws, req)
    })
  })

  // Heartbeat to detect broken connections without relying on app-level messages.
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        removeClient(c)
        continue
      }
      c.alive = false
      try {
        c.ws.ping()
      } catch {
        removeClient(c)
      }
    }
  }, 10_000)

  const close = async () => {
    clearInterval(heartbeat)
    for (const c of clients) {
      try {
        c.ws.close()
      } catch {
        // ignore
      }
    }
    clients.clear()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const addr = server.address()
  if (!addr || typeof addr === 'string') {
    await close()
    throw new Error('ws_listen_failed')
  }

  const wsUrl = `ws://127.0.0.1:${addr.port}/`

  const broadcast = (event: LogEvent | StatusEvent) => {
    // Broadcast is best-effort. Failed sends remove the client to avoid leaks.
    pushBacklog(event)
    for (const c of clients) {
      if (!safeSend(c.ws, event)) {
        removeClient(c)
      }
    }
  }

  return { wsUrl, token, broadcast, close }
}
