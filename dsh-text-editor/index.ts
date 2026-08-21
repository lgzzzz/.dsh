/**
 * dsh-text-editor — Node half (index.ts, 由 Node 22 Type Stripping 直接加载).
 *
 * 注册两条 loopback 路由：
 *
 *   1. GET /dsh-text-editor/read?path=<p>&cwd=<cwd>
 *      读取文本文件内容给应用内编辑器。读取走已挂载的 `fs` 服务（沙箱 provider），
 *      所有权限模式下都允许读取；`~` 展开为宿主主目录；相对路径按 cwd 解析；
 *      大文件截断为前 TRUNCATE_BYTES。
 *
 *   2. /dsh-text-editor/monaco/<path>
 *      托管随插件打包的 Monaco Editor 最小化 AMD 发行版（vendor/monaco），
 *      同源提供、离线可用；带目录穿越防护。
 *
 * 宿主半部硬依赖 webServer 与 fs，通过 cordis.patch.yml 行的 `inject` 声明。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-text-editor'

/** 用到的 fs 服务最小面（权威类型在 DSH 的 dsh-fs 包里）。 */
interface FileSystem {
  resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string, expected?: unknown, signal?: unknown, sandboxPolicy?: unknown): Promise<unknown>
  processPath(target: unknown): string
}

/** 用到的 sessions 服务最小面。 */
interface SessionsService {
  get(id: string): { id: string; header: { cwd?: string } } | undefined
}

/** 用到的 sandboxPolicy 服务最小面。 */
interface SandboxPolicyService {
  resolve(request?: { session?: { id: string; header: { cwd?: string } } }): unknown
}

/** 用到的 webServer 服务最小面。 */
interface WebServer {
  register(route: WebRoute): () => void
}

/** 一条 web 路由注册。 */
interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** 最多返回这么多字符；更大的文件截断。 */
const TRUNCATE_BYTES = 2_000_000

/** 读取路由；浏览器半部 fetch 的正是它。 */
const ROUTE_PATH = '/dsh-text-editor/read'

/** 保存路由（POST，应用内编辑器「保存」按钮）。 */
const WRITE_ROUTE = '/dsh-text-editor/write'

/** Monaco 发行版的磁盘根（以分隔符结尾）。 */
const MONACO_ROOT = fileURLToPath(new URL('./vendor/monaco/', import.meta.url))

/** Monaco 发行版的 URL 前缀。 */
const MONACO_PREFIX = '/dsh-text-editor/monaco'

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

/** 展开开头的 `~` / `~/` 为宿主主目录。 */
function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return homedir() + path.slice(1)
  return path
}

/** 以 JSON 响应结束请求（禁止缓存）。 */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** 读取并 JSON 解析请求体。 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
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

/** 提供一份 Monaco 资源；拒绝任何逃出 bundle 根的路径。 */
async function serveMonacoAsset(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

/**
 * 插件主体：为行的生命周期注册读取路由、保存路由与 Monaco 静态路由。
 * @param ctx - 宿主根上下文。
 */
export function apply(ctx: Context): void {
  // 硬依赖来自行的 `inject`（webServer, fs）；用 ctx.get 读取，缺失则静默降级。
  const fs = ctx.get('fs') as FileSystem | undefined
  const webServer = ctx.get('webServer') as WebServer | undefined
  if (fs === undefined || webServer === undefined) return
  // 可选服务：保存时的会话沙箱策略。
  const sessions = ctx.get('sessions') as SessionsService | undefined
  const sandboxPolicy = ctx.get('sandboxPolicy') as SandboxPolicyService | undefined

  ctx.effect(() => {
    const stopRead = webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const rawPath = expandHome(url.searchParams.get('path') ?? '')
          const cwd = url.searchParams.get('cwd') ?? ''
          if (rawPath === '') {
            json(res, 400, { ok: false, error: 'missing "path" query parameter' })
            return
          }

          const target = await fs.resolve(rawPath, cwd === '' ? undefined : { cwd })
          let content = await fs.readText(target)
          let truncated = false
          if (content.length > TRUNCATE_BYTES) {
            content = content.slice(0, TRUNCATE_BYTES)
            truncated = true
          }
          const binary = content.includes('\u0000')
          json(res, 200, {
            ok: true,
            path: fs.processPath(target),
            content: binary ? '' : content,
            binary,
            truncated,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          json(res, 404, { ok: false, error: message })
        }
      },
    })
    const stopWrite = webServer.register({
      kind: 'exact',
      path: WRITE_ROUTE,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readJsonBody(req) as {
            path?: unknown
            cwd?: unknown
            content?: unknown
            sessionId?: unknown
          }
          const rawPath = typeof body.path === 'string' ? expandHome(body.path) : ''
          const cwd = typeof body.cwd === 'string' ? body.cwd : ''
          const content = typeof body.content === 'string' ? body.content : ''
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined
          if (rawPath === '') {
            json(res, 400, { ok: false, error: 'missing "path"' })
            return
          }
          const target = await fs.resolve(rawPath, cwd === '' ? undefined : { cwd })
          // 按会话解析沙箱策略：工作区写边界取该会话 cwd，权限模式取会话覆盖/默认。
          const policy = sandboxPolicy?.resolve(
            sessionId === undefined ? {} : { session: sessions?.get(sessionId) },
          )
          await fs.writeText(target, content, undefined, undefined, policy)
          json(res, 200, { ok: true, path: fs.processPath(target) })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          json(res, 403, { ok: false, error: message })
        }
      },
    })
    const stopMonaco = webServer.register({
      kind: 'prefix',
      path: MONACO_PREFIX,
      handler: serveMonacoAsset,
    })
    return () => {
      stopRead()
      stopWrite()
      stopMonaco()
    }
  })
}

export default { name, apply }
