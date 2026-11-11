import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const gunzip = promisify(zlib.gunzip)
const repo = "jdecked/twemoji"
const headers = { "User-Agent": "skia-canvas-with-twemoji" }
const cacheDir = fileURLToPath(new URL(".cache", import.meta.url))

export let version = null
let packPath = null
let packIndex = null
let packDataStart = 0

export function readSvg(codepoint) {
  const entry = packIndex[codepoint] ?? packIndex[codepoint.replaceAll("-fe0f", "")]
  if (!entry) return null
  const data = Buffer.alloc(entry[1])
  const fd = fs.openSync(packPath, "r")
  try {
    fs.readSync(fd, data, 0, entry[1], packDataStart + entry[0])
  } finally {
    fs.closeSync(fd)
  }
  return data
}

function cachedVersions() {
  let names
  try {
    names = fs.readdirSync(cacheDir)
  } catch (err) {
    if (err.code === "ENOENT") return []
    throw err
  }
  return names.filter(name => name.endsWith(".pack")).map(name => name.slice(0, -5)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function use(tag) {
  const file = path.join(cacheDir, `${tag}.pack`)
  const fd = fs.openSync(file, "r")
  try {
    const header = Buffer.alloc(4)
    fs.readSync(fd, header, 0, 4, 0)
    const json = Buffer.alloc(header.readUInt32LE(0))
    fs.readSync(fd, json, 0, json.length, 4)
    packIndex = JSON.parse(json.toString())
    packDataStart = 4 + json.length
  } finally {
    fs.closeSync(fd)
  }
  packPath = file
  version = tag
}

async function latestTag() {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
  if (!res.ok) throw new Error(`Failed to check the latest Twemoji release (HTTP ${res.status})`)
  return (await res.json()).tag_name
}

async function download(tag) {
  const res = await fetch(`https://codeload.github.com/${repo}/tar.gz/refs/tags/${tag}`, { headers })
  if (!res.ok) throw new Error(`Failed to download Twemoji ${tag} (HTTP ${res.status})`)
  const files = extractSvgs(await gunzip(Buffer.from(await res.arrayBuffer())))
  if (!files.length) throw new Error(`Twemoji ${tag} contains no SVGs`)
  const index = {}
  let offset = 0
  for (const file of files) {
    index[file.name.slice(0, -4)] = [offset, file.data.length]
    offset += file.data.length
  }
  const json = Buffer.from(JSON.stringify(index))
  const header = Buffer.alloc(4)
  header.writeUInt32LE(json.length, 0)
  const target = path.join(cacheDir, `${tag}.pack`)
  const partial = `${target}.partial-${process.pid}`
  await fs.promises.mkdir(cacheDir, { recursive: true })
  await fs.promises.writeFile(partial, Buffer.concat([header, json].concat(files.map(file => file.data))))
  try {
    await fs.promises.rename(partial, target)
  } catch (err) {
    await fs.promises.rm(partial, { force: true })
    if (!fs.existsSync(target)) throw err
  }
}

function extractSvgs(tar) {
  const files = []
  let offset = 0
  let paxPath = null
  while (offset + 512 <= tar.length && tar[offset] !== 0) {
    const header = tar.subarray(offset, offset + 512)
    const size = parseInt(field(header, 124, 12), 8) || 0
    const type = field(header, 156, 1)
    const prefix = field(header, 345, 155)
    const name = paxPath ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100))
    const data = tar.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
    if (type === "x") {
      paxPath = data.toString().match(/(?:^|\n)\d+ path=([^\n]*)\n/)?.[1] ?? null
      continue
    }
    paxPath = null
    if (type !== "0" && type !== "") continue
    const match = name.match(/^[^/]+\/assets\/svg\/([^/]+\.svg)$/)
    if (match) files.push({ name: match[1], data })
  }
  return files
}

function field(header, start, length) {
  const value = header.toString("utf8", start, start + length)
  const end = value.indexOf("\0")
  return end === -1 ? value : value.slice(0, end)
}

async function update(current) {
  const tag = await latestTag()
  if (tag === current) return
  await download(tag)
  use(tag)
  await cleanCache()
}

async function cleanCache() {
  for (const name of await fs.promises.readdir(cacheDir)) {
    if (name === `${version}.pack`) continue
    const pid = Number(name.match(/\.partial-(\d+)$/)?.[1])
    if (pid && pid !== process.pid && processRunning(pid)) continue
    await fs.promises.rm(path.join(cacheDir, name), { recursive: true, force: true })
  }
}

function processRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === "EPERM"
  }
}

const cached = cachedVersions().at(-1)
if (cached) {
  use(cached)
  cleanCache().then(() => update(cached)).catch(err => console.warn(`skia-canvas-with-twemoji: failed to update Twemoji, using ${cached}`, err))
} else {
  await update(null).catch(err => console.warn("skia-canvas-with-twemoji: failed to download Twemoji, using the system emoji font", err))
}
