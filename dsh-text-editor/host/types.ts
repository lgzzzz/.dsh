/**
 * 宿主半部用到的 DSH 服务最小面（权威类型在 @deepseek-ai/dsh-fs、dsh-sessions、
 * dsh-sandbox-policy、dsh-web-server 等包里；这里只声明本插件用到的方法，
 * 避免引入内部包）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 用到的 fs 服务最小面。 */
export interface FileSystem {
  resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string, expected?: unknown, signal?: unknown, sandboxPolicy?: unknown): Promise<unknown>
  processPath(target: unknown): string
}

/** 用到的 sessions 服务最小面。 */
export interface SessionsService {
  get(id: string): { id: string; header: { cwd?: string } } | undefined
}

/** 用到的 sandboxPolicy 服务最小面。 */
export interface SandboxPolicyService {
  resolve(request?: { session?: { id: string; header: { cwd?: string } } }): unknown
}

/** 用到的 webServer 服务最小面。 */
export interface WebServer {
  register(route: WebRoute): () => void
}

/** 一条 web 路由注册。 */
export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
