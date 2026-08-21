/**
 * 宿主半部共用的 HTTP 小工具：JSON 响应、请求体解析、`~` 展开。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'

/** 展开开头的 `~` / `~/` 为宿主主目录。 */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return homedir() + path.slice(1)
  return path
}

/** 以 JSON 响应结束请求（禁止缓存）。 */
export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** 读取并 JSON 解析请求体。 */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}
