/**
 * Monaco 静态托管：同源提供随插件打包的 AMD 发行版（vendor/monaco），
 * 离线可用；带目录穿越防护。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Monaco 发行版的 URL 前缀。 */
export const MONACO_PREFIX = '/dsh-text-editor/monaco'

/** Monaco 发行版的磁盘根（本文件在 host/ 下，vendor 在仓库根，故基准用 ../）。 */
const MONACO_ROOT = fileURLToPath(new URL('../vendor/monaco/', import.meta.url))

/** Monaco 静态文件的 Content-Type 表。 */
const MONACO_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
}

/** 提供一份 Monaco 资源；拒绝任何逃出 bundle 根的路径。 */
export async function serveMonacoAsset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const rel = decodeURIComponent(url.pathname.slice(MONACO_PREFIX.length))
    if (rel === '' || rel.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return
    }
    const safe = normalize(rel).replace(/^([/\\])+/, '')
    const file = join(MONACO_ROOT, safe)
    if (!file.startsWith(MONACO_ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return
    }
    const dot = file.lastIndexOf('.')
    const type = MONACO_TYPES[file.slice(dot).toLowerCase()] ?? 'application/octet-stream'
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' })
    res.end(data)
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
}
