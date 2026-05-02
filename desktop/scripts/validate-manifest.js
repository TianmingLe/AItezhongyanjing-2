import fs from 'node:fs'
import path from 'node:path'

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v) => typeof v === 'string'
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)

const sha256Re = /^[a-f0-9]{64}$/i

const die = (msg) => {
  process.stderr.write(`${msg}\n`)
  process.exit(1)
}

const errAt = (file, pointer, msg) => die(`${file}:${pointer} ${msg}`)

const findLinePointer = (text, needle) => {
  const idx = text.indexOf(needle)
  if (idx < 0) return '?:?'
  const before = text.slice(0, idx)
  const line = before.split('\n').length
  const col = idx - before.lastIndexOf('\n')
  return `${line}:${col}`
}

const containsBadChars = (s) => /[\0\r\n]/.test(s)

const validateDest = ({ file, jsonText, dest, resourcesRoot }) => {
  if (!isString(dest) || !dest) errAt(file, '?:?', 'dest must be non-empty string')
  if (containsBadChars(dest)) errAt(file, findLinePointer(jsonText, `"dest"`), 'dest contains invalid characters')
  if (path.isAbsolute(dest)) errAt(file, findLinePointer(jsonText, dest), 'dest must be relative path')

  const normalized = path.normalize(dest).replace(/\\/g, '/')
  if (normalized.startsWith('..') || normalized.includes('/../') || normalized.includes('\\..\\')) {
    errAt(file, findLinePointer(jsonText, dest), 'dest path traversal detected')
  }

  const abs = path.resolve(resourcesRoot, normalized)
  const rootAbs = path.resolve(path.join(resourcesRoot, 'resources'))
  if (!abs.startsWith(rootAbs + path.sep) && abs !== rootAbs) {
    errAt(file, findLinePointer(jsonText, dest), 'dest must be inside resourcesRoot')
  }
}

const validateItem = ({ file, jsonText, idx, item, resourcesRoot }) => {
  if (!isRecord(item)) errAt(file, '?:?', `resources[${idx}] must be object`)
  const { name, url, sha256, dest, size_mb } = item
  if (!isString(name) || !name) errAt(file, findLinePointer(jsonText, `"name"`), `resources[${idx}].name required`)
  if (!isString(url) || !url) errAt(file, findLinePointer(jsonText, `"url"`), `resources[${idx}].url required`)
  if (!isString(sha256) || !sha256Re.test(sha256)) {
    errAt(file, findLinePointer(jsonText, `"sha256"`), `resources[${idx}].sha256 must be 64 hex`)
  }
  validateDest({ file, jsonText, dest, resourcesRoot })
  if (size_mb !== undefined && !isNumber(size_mb)) errAt(file, findLinePointer(jsonText, `"size_mb"`), `resources[${idx}].size_mb must be number`)
}

const main = () => {
  const file = process.argv[2]
  if (!file) die('usage: node scripts/validate-manifest.js <manifest.json>')
  const absFile = path.resolve(process.cwd(), file)
  const jsonText = fs.readFileSync(absFile, 'utf-8')

  let manifest
  try {
    manifest = JSON.parse(jsonText)
  } catch (e) {
    die(`${file}:?:? invalid_json ${String(e)}`)
  }

  if (!isRecord(manifest)) errAt(file, '?:?', 'manifest must be object')
  const keys = Object.keys(manifest)
  for (const k of keys) {
    if (k !== 'version' && k !== 'resources') errAt(file, findLinePointer(jsonText, `"${k}"`), `unknown field ${k}`)
  }

  if (!isString(manifest.version) || !manifest.version) errAt(file, findLinePointer(jsonText, `"version"`), 'version required')
  if (!Array.isArray(manifest.resources)) errAt(file, findLinePointer(jsonText, `"resources"`), 'resources must be array')

  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (!home) errAt(file, '?:?', 'cannot resolve home directory')
  const exportsRoot = path.join(home, 'OmniScraperExports')
  const resourcesRoot = path.join(exportsRoot, 'resources')

  for (let i = 0; i < manifest.resources.length; i++) {
    validateItem({ file, jsonText, idx: i, item: manifest.resources[i], resourcesRoot: exportsRoot })
  }

  process.stdout.write('ok\n')
  process.exit(0)
}

main()
