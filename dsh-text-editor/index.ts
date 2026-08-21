/**
 * dsh-text-editor — 宿主半部入口（Node 22+ Type Stripping 直接加载，无需编译）。
 *
 * 本文件只做装配：从 ctx 取服务（硬依赖 webServer、fs，由 cordis.patch.yml 行的
 * inject 声明），在 effect 内注册三条 loopback 路由。具体实现按功能拆在 host/：
 *
 *   - host/read.ts     GET  /dsh-text-editor/read?path=&cwd=   读文件（走 ctx.fs）
 *   - host/write.ts    POST /dsh-text-editor/write             保存（按会话解析 sandboxPolicy）
 *   - host/monaco.ts   GET  /dsh-text-editor/monaco/*          托管本地 Monaco 发行版
 *   - host/http.ts     共用 HTTP 小工具（JSON 响应 / 请求体 / ~ 展开）
 *   - host/types.ts    用到的 DSH 服务最小面类型
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FileSystem, SandboxPolicyService, SessionsService, WebServer } from './host/types.ts'
import { READ_ROUTE, readHandler } from './host/read.ts'
import { WRITE_ROUTE, writeHandler } from './host/write.ts'
import { MONACO_PREFIX, serveMonacoAsset } from './host/monaco.ts'

export const name = 'dsh-text-editor'

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
      path: READ_ROUTE,
      handler: readHandler(fs),
    })
    const stopWrite = webServer.register({
      kind: 'exact',
      path: WRITE_ROUTE,
      handler: writeHandler({ fs, sessions, sandboxPolicy }),
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
