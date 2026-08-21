/**
 * 读取路由：浏览器半部 fetch 的正是它（GET /dsh-text-editor/read?path=&cwd=）。
 * 读取走已挂载的 `fs` 服务（沙箱 provider），所有权限模式下都允许读取；
 * `~` 展开为宿主主目录；相对路径按 cwd 解析；大文件截断为前 TRUNCATE_BYTES。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FileSystem } from './types.ts'
import { expandHome, json } from './http.ts'

export const READ_ROUTE = '/dsh-text-editor/read'

/** 最多返回这么多字符；更大的文件截断。 */
const TRUNCATE_BYTES = 2_000_000

/** 构造读取路由处理函数（依赖注入 fs 服务）。 */
export function readHandler(fs: FileSystem): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
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
  }
}
