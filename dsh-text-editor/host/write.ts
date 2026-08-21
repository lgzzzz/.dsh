/**
 * 保存路由（POST /dsh-text-editor/write，应用内编辑器「保存」按钮）。
 * 按会话解析沙箱策略：工作区写边界取该会话 cwd，权限模式取会话覆盖/默认；
 * 工作区外写入被 `fs` 拒绝（HTTP 403，状态栏显示错误）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FileSystem, SandboxPolicyService, SessionsService } from './types.ts'
import { expandHome, json, readJsonBody } from './http.ts'

export const WRITE_ROUTE = '/dsh-text-editor/write'

/** 构造写路由所需的依赖（fs 必选；sessions / sandboxPolicy 可选，缺失时保存不带 policy）。 */
export interface WriteDeps {
  fs: FileSystem
  sessions?: SessionsService | undefined
  sandboxPolicy?: SandboxPolicyService | undefined
}

/** 构造保存路由处理函数（依赖注入）。 */
export function writeHandler(deps: WriteDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { fs, sessions, sandboxPolicy } = deps
  return async (req, res) => {
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
      // 按会话解析沙箱策略：写边界/权限模式取自该会话。
      const policy = sandboxPolicy?.resolve(
        sessionId === undefined ? {} : { session: sessions?.get(sessionId) },
      )
      await fs.writeText(target, content, undefined, undefined, policy)
      json(res, 200, { ok: true, path: fs.processPath(target) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      json(res, 403, { ok: false, error: message })
    }
  }
}
