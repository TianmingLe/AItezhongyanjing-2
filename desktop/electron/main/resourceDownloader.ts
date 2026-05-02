import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { createRequire } from 'node:module'

import { ProxyAgent } from 'proxy-agent'

import type { ManifestSchema } from '../shared/resources'
import { isManifestSchema } from '../shared/resources'

import { acquireResourceLock } from './resourceLock'

export type DownloadPhase = 'downloading' | 'verifying' | 'extracting'

export type ResourceProgress = {
  type: 'progress'
  resourceName: string
  phase: DownloadPhase
  percent: number
  message: string
}

type Options = {
  appRoot: string
  homeDir: string
  manifestPath?: string
  onProgress?: (ev: ResourceProgress) => void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(() => r(), ms))

const ensureDir = async (p: string) => {
  await fs.mkdir(p, { recursive: true })
}

const getFreeBytes = async (p: string) => {
  const fake = process.env.OMNI_FAKE_FREE_BYTES
  if (fake && Number.isFinite(Number(fake))) return Number(fake)
  const fn = (fs as any).statfs as undefined | ((path: string) => Promise<any>)
  if (!fn) return null
  const s = await fn(p)
  const bsize = typeof s.bsize === 'number' ? s.bsize : typeof s.frsize === 'number' ? s.frsize : null
  const bfree = typeof s.bfree === 'number' ? s.bfree : null
  if (!bsize || !bfree) return null
  return bsize * bfree
}

const exists = async (p: string) => {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

type SimpleResponse = {
  statusCode: number
  headers: Record<string, unknown>
  stream: NodeJS.ReadableStream
  resume?: () => void
  destroy?: () => void
}

const shouldBypassProxy = (urlStr: string) => {
  const u = new URL(urlStr)
  const host = u.hostname
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''
  if (!noProxy) return false
  const parts = noProxy
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  for (const p of parts) {
    if (p === '*') return true
    if (p === host) return true
    if (p.startsWith('.') && host.endsWith(p)) return true
    if (!p.startsWith('.') && host.endsWith(`.${p}`)) return true
  }
  return false
}

let cachedProxyAgent: any = null

const getProxyAgent = async (urlStr: string) => {
  if (shouldBypassProxy(urlStr)) return null
  const p =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    ''
  if (!p) return null
  if (cachedProxyAgent) return cachedProxyAgent
  cachedProxyAgent = new ProxyAgent()
  return cachedProxyAgent
}

const requestStream = async (urlStr: string): Promise<{ res: SimpleResponse; url: string }> => {
  const agent = await getProxyAgent(urlStr)
  const res = await new Promise<SimpleResponse>((resolve, reject) => {
    const u = new URL(urlStr)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        family: 4,
        timeout: 30_000,
        agent: agent || undefined,
        headers: { 'user-agent': 'OmniScraper/desktop' },
      },
      (r) =>
        resolve({
          statusCode: r.statusCode || 0,
          headers: r.headers as any,
          stream: r,
          resume: () => r.resume(),
          destroy: () => r.destroy(),
        }),
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('ETIMEDOUT')))
    req.end()
  })
  return { res, url: urlStr }
}

const fetchWithRedirects = async (url: string, maxRedirects: number) => {
  let current = url
  for (let i = 0; i <= maxRedirects; i++) {
    const { res } = await requestStream(current)
    const code = res.statusCode || 0
    const location = (res.headers as any).location
    if (code >= 300 && code < 400 && location) {
      const next = new URL(String(location), current).toString()
      res.resume?.()
      current = next
      continue
    }
    if (code < 200 || code >= 300) {
      const body = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = []
        res.stream.on('data', (c) => chunks.push(Buffer.from(c)))
        res.stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        res.stream.on('error', () => resolve(''))
      })
      throw new Error(`http_${code}:${body.slice(0, 120)}`)
    }
    return { res, finalUrl: current }
  }
  throw new Error('too_many_redirects')
}

const safeResolveDest = (homeDir: string, dest: string) => {
  if (path.isAbsolute(dest)) throw new Error('dest_must_be_relative')
  const exportsRoot = path.join(homeDir, 'OmniScraperExports')
  const resourcesRoot = path.join(exportsRoot, 'resources')
  const normalized = path.normalize(dest)
  const abs = path.resolve(exportsRoot, normalized)
  const resourcesAbs = path.resolve(resourcesRoot)
  if (!abs.startsWith(resourcesAbs + path.sep) && abs !== resourcesAbs) throw new Error('dest_outside_resources_root')
  return { exportsRoot, resourcesRoot, abs }
}

const archiveTypeFromUrl = (u: string): 'zip' | 'tar' | null => {
  if (u.endsWith('.zip')) return 'zip'
  if (u.endsWith('.tar.gz') || u.endsWith('.tgz')) return 'tar'
  return null
}

const computeTargets = (homeDir: string, item: { url: string; dest: string }) => {
  const { abs } = safeResolveDest(homeDir, item.dest)
  const urlBase = path.posix.basename(new URL(item.url).pathname)
  const destExt = path.extname(abs)
  const urlExt = path.extname(urlBase)
  const destIsFile = destExt.length > 1 && urlExt.length > 1 && destExt.toLowerCase() === urlExt.toLowerCase()
  const aType = archiveTypeFromUrl(item.url)
  if (aType) {
    const tmpFile = path.join(abs, `${urlBase || 'archive'}.tmp`)
    return { kind: 'archive' as const, destDir: abs, tmpFile, archiveType: aType }
  }
  if (destIsFile) {
    return { kind: 'file' as const, destFile: abs, tmpFile: `${abs}.tmp`, readyDir: path.dirname(abs), fileName: path.basename(abs) }
  }
  const destDir = abs
  const destFile = path.join(destDir, urlBase || 'download.bin')
  return { kind: 'file' as const, destFile, tmpFile: `${destFile}.tmp`, readyDir: destDir, fileName: path.basename(destFile) }
}

const downloadOnce = async (input: {
  url: string
  tmpFile: string
  expectedSha256: string
  totalBytesHint?: number
  onProgress: (p: number, msg: string) => void
}) => {
  await ensureDir(path.dirname(input.tmpFile))
  const { res } = await fetchWithRedirects(input.url, 5)
  const totalHeader = (res.headers as any)['content-length']
  const total =
    typeof totalHeader === 'string' && Number.isFinite(Number(totalHeader))
      ? Number(totalHeader)
      : input.totalBytesHint && input.totalBytesHint > 0
        ? input.totalBytesHint
        : null

  const hash = crypto.createHash('sha256')
  let done = 0
  res.stream.on('data', (chunk) => {
    const buf = Buffer.from(chunk)
    hash.update(buf)
    done += buf.length
    const percent = total ? Math.max(0, Math.min(99, Math.floor((done / total) * 100))) : 0
    input.onProgress(percent, total ? `${Math.floor(done / 1024)}KB / ${Math.floor(total / 1024)}KB` : `${Math.floor(done / 1024)}KB`)
  })

  const out = createWriteStream(input.tmpFile)
  try {
    await pipeline(res.stream as any, out)
  } catch (e) {
    try {
      await fs.unlink(input.tmpFile)
    } catch {
      // ignore
    }
    throw e
  }

  input.onProgress(100, 'downloaded')
  const digest = hash.digest('hex')
  if (digest.toLowerCase() !== input.expectedSha256.toLowerCase()) {
    try {
      await fs.unlink(input.tmpFile)
    } catch {
      // ignore
    }
    throw new Error('sha256_mismatch')
  }
}

const importModule = async (name: string): Promise<any> => {
  const fn = new Function('m', 'return import(m)') as (m: string) => Promise<any>
  return fn(name)
}

const requireForDeps = (() => {
  try {
    const metaUrl = new Function('return import.meta.url')() as string
    return createRequire(metaUrl)
  } catch {
    return createRequire(typeof __filename === 'string' ? __filename : path.join(process.cwd(), 'package.json'))
  }
})()

const extractArchive = async (input: { archivePath: string; archiveType: 'zip' | 'tar'; destDir: string }, onMessage: (m: string) => void) => {
  const { archivePath, archiveType, destDir } = input
  await ensureDir(destDir)
  if (archiveType === 'zip') {
    const AdmZip = (requireForDeps as any)('adm-zip')
    const Zip = AdmZip.default || AdmZip
    const zip = new Zip(archivePath)
    zip.extractAllTo(destDir, true)
    onMessage('zip_extracted')
    return
  }
  const tar: any = (requireForDeps as any)('tar')
  await (tar.default || tar).x({ file: archivePath, cwd: destDir })
  onMessage('tar_extracted')
}

export const setupResources = async (opts: Options): Promise<void> => {
  const onProgress = opts.onProgress || (() => undefined)
  const manifestPath = opts.manifestPath || path.join(opts.appRoot, 'resources-manifest.json')
  const text = await fs.readFile(manifestPath, 'utf-8')
  const json = JSON.parse(text) as unknown
  if (!isManifestSchema(json)) throw new Error('bad_manifest_schema')
  const manifest = json as ManifestSchema

  const resourcesRoot = path.join(opts.homeDir, 'OmniScraperExports', 'resources')
  await ensureDir(resourcesRoot)
  const requiredBytes = manifest.resources.reduce((sum, r) => sum + (typeof r.size_mb === 'number' ? r.size_mb : 0), 0) * 1024 * 1024
  if (requiredBytes > 0) {
    const free = await getFreeBytes(resourcesRoot)
    if (free !== null && free < requiredBytes * 1.1) {
      throw new Error('disk_space_insufficient')
    }
  }
  const lockPath = path.join(resourcesRoot, '.download.lock')
  const release = await acquireResourceLock(lockPath, { staleMs: 30 * 60 * 1000 })
  try {
    for (const item of manifest.resources) {
      const targets = computeTargets(opts.homeDir, item)
      const readyDir = targets.kind === 'archive' ? targets.destDir : targets.readyDir
      const readyMark = path.join(readyDir, '.ready')
      if (await exists(readyMark)) continue

      const totalHint = typeof item.size_mb === 'number' ? Math.max(1, item.size_mb) * 1024 * 1024 : undefined

      let lastErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          onProgress({ type: 'progress', resourceName: item.name, phase: 'downloading', percent: 0, message: 'start' })
          await downloadOnce({
            url: item.url,
            tmpFile: targets.tmpFile,
            expectedSha256: item.sha256,
            totalBytesHint: totalHint,
            onProgress: (p, msg) => onProgress({ type: 'progress', resourceName: item.name, phase: 'downloading', percent: p, message: msg }),
          })

          onProgress({ type: 'progress', resourceName: item.name, phase: 'verifying', percent: 100, message: 'sha256 ok' })

          if (targets.kind === 'archive') {
            onProgress({ type: 'progress', resourceName: item.name, phase: 'extracting', percent: 0, message: 'extracting' })
            await extractArchive({ archivePath: targets.tmpFile, archiveType: targets.archiveType, destDir: targets.destDir }, (m) =>
              onProgress({ type: 'progress', resourceName: item.name, phase: 'extracting', percent: 50, message: m }),
            )
            try {
              await fs.unlink(targets.tmpFile)
            } catch {
              // ignore
            }
            onProgress({ type: 'progress', resourceName: item.name, phase: 'extracting', percent: 100, message: 'done' })
          } else {
            await ensureDir(path.dirname(targets.destFile))
            await fs.rename(targets.tmpFile, targets.destFile)
          }

          await ensureDir(readyDir)
          await fs.writeFile(readyMark, String(Date.now()), 'utf-8')
          break
        } catch (e) {
          lastErr = e
          const wait = Math.min(200 * 2 ** attempt, 2000)
          await sleep(wait)
          continue
        }
      }
      if (lastErr) {
        if (!(await exists(path.join(targets.kind === 'archive' ? targets.destDir : targets.readyDir, '.ready')))) {
          throw lastErr
        }
      }
    }
  } finally {
    await release()
  }
}
