import fs from 'node:fs'
import path from 'node:path'

import WebSocket from 'ws'

const wsInfoPath = process.argv[2]
const outPath = process.argv[3]

if (!wsInfoPath || !outPath) {
  process.exit(2)
}

const waitForFile = async (p, timeoutMs = 10000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (fs.existsSync(p)) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('wsinfo_timeout')
}

const append = (obj) => {
  fs.appendFileSync(outPath, `${JSON.stringify(obj)}\n`)
}

const connectOnce = (url) =>
  new Promise((resolve) => {
    const ws = new WebSocket(url)
    const msgs = []
    ws.on('message', (buf) => {
      try {
        msgs.push(JSON.parse(String(buf)))
      } catch {
        msgs.push({ type: 'raw', data: String(buf) })
      }
    })
    ws.on('open', () => {
      append({ event: 'ws_open', url })
    })
    ws.on('close', () => {
      append({ event: 'ws_close' })
      resolve(msgs)
    })
    ws.on('error', (e) => {
      append({ event: 'ws_error', message: String(e) })
      try {
        ws.close()
      } catch {
        // ignore
      }
      resolve(msgs)
    })
    setTimeout(() => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }, 2500)
  })

await waitForFile(wsInfoPath)
const wsInfo = JSON.parse(fs.readFileSync(wsInfoPath, 'utf-8'))
const url = `${wsInfo.wsUrl}?token=${encodeURIComponent(wsInfo.token)}`

append({ event: 'wsinfo', wsUrl: wsInfo.wsUrl })

const first = await connectOnce(url)
append({ event: 'first_session', initCount: first.filter((m) => m.type === 'init').length, msgCount: first.length })

const second = await connectOnce(url)
append({ event: 'second_session', initCount: second.filter((m) => m.type === 'init').length, msgCount: second.length })

